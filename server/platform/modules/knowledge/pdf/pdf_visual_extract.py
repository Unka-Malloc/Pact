#!/usr/bin/env python3
import argparse
import base64
import json
import re
import sys
from pathlib import Path


def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return code


def media_type_for_extension(extension):
    normalized = extension.lower().lstrip(".")
    if normalized in {"jpg", "jpeg"}:
        return "image/jpeg"
    if normalized == "png":
        return "image/png"
    if normalized == "webp":
        return "image/webp"
    if normalized == "jp2":
        return "image/jp2"
    if normalized == "gif":
        return "image/gif"
    return "application/octet-stream"


def clean_cell(value):
    text = "" if value is None else str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join([line for line in lines if line]).strip()


def normalize_rows(rows):
    cleaned = []
    max_columns = 0
    for row in rows or []:
        cells = [clean_cell(cell) for cell in row or []]
        if any(cells):
            cleaned.append(cells)
            max_columns = max(max_columns, len(cells))
    if max_columns <= 0:
        return []
    return [row + [""] * (max_columns - len(row)) for row in cleaned]


def table_is_useful(rows, min_non_empty_cells):
    if len(rows) < 2:
        return False
    column_count = max((len(row) for row in rows), default=0)
    if column_count < 2:
        return False
    non_empty_cells = sum(1 for row in rows for cell in row if cell)
    return non_empty_cells >= min_non_empty_cells


def markdown_escape(value):
    return clean_cell(value).replace("|", "\\|").replace("\n", "<br>")


def rows_to_markdown(rows):
    if not rows:
        return ""
    header = rows[0]
    body = rows[1:]
    lines = [
        "| " + " | ".join(markdown_escape(cell) for cell in header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(markdown_escape(cell) for cell in row) + " |")
    return "\n".join(lines)


def rect_to_list(rect):
    if not rect:
        return []
    try:
        return [round(float(rect[0]), 2), round(float(rect[1]), 2), round(float(rect[2]), 2), round(float(rect[3]), 2)]
    except Exception:
        return []


def extract_images(pdf_path, max_images, max_image_bytes):
    import fitz

    doc = fitz.open(pdf_path)
    images = []
    warnings = []
    page_texts = []
    image_count = 0
    for page_index, page in enumerate(doc, start=1):
        try:
            page_texts.append({"page": page_index, "text": clean_cell(page.get_text("text"))})
        except Exception as error:
            warnings.append(f"Page {page_index} text extraction failed: {error}")
            page_texts.append({"page": page_index, "text": ""})
        for image_index, image_ref in enumerate(page.get_images(full=True), start=1):
            image_count += 1
            if image_count > max_images:
                warnings.append(f"Image extraction reached max_images={max_images}; remaining images were skipped.")
                return images, warnings, len(doc), page_texts

            xref = image_ref[0]
            extracted = doc.extract_image(xref)
            data = extracted.get("image") or b""
            extension = extracted.get("ext") or "bin"
            media_type = media_type_for_extension(extension)
            rects = []
            try:
                rects = [rect_to_list(rect) for rect in page.get_image_rects(xref)]
            except Exception:
                rects = []
            rects = [rect for rect in rects if rect]
            title = f"Page {page_index} Image {image_index}"
            element = {
                "kind": "image",
                "page": page_index,
                "index": image_index,
                "title": title,
                "fileName": f"page-{page_index:03d}-image-{image_index:03d}.{extension}",
                "mediaType": media_type,
                "byteSize": len(data),
                "width": int(extracted.get("width") or 0),
                "height": int(extracted.get("height") or 0),
                "bbox": rects[0] if rects else [],
                "bboxes": rects,
                "xref": int(xref),
                "extractionMethod": "pymupdf.get_images",
            }
            if len(data) <= max_image_bytes:
                encoded = base64.b64encode(data).decode("ascii")
                element["dataUrl"] = f"{media_type};base64,{encoded}"
                element["dataUrl"] = "data:" + element["dataUrl"]
            else:
                warnings.append(f"{title} exceeded max_image_bytes={max_image_bytes}; binary payload was skipped.")
            images.append(element)
    return images, warnings, len(doc), page_texts


def extract_tables(pdf_path, min_non_empty_cells):
    try:
        import pdfplumber
    except Exception as error:
        return [], [f"pdfplumber unavailable: {error}"]

    tables = []
    warnings = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            try:
                found_tables = page.find_tables()
            except Exception as error:
                warnings.append(f"Page {page_index} table detection failed: {error}")
                found_tables = []
            for table_index, table in enumerate(found_tables, start=1):
                try:
                    rows = normalize_rows(table.extract())
                except Exception as error:
                    warnings.append(f"Page {page_index} table {table_index} extraction failed: {error}")
                    continue
                if not table_is_useful(rows, min_non_empty_cells):
                    continue
                markdown = rows_to_markdown(rows)
                tables.append(
                    {
                        "kind": "table",
                        "page": page_index,
                        "index": table_index,
                        "title": f"Page {page_index} Table {table_index}",
                        "rows": rows,
                        "rowCount": len(rows),
                        "columnCount": max((len(row) for row in rows), default=0),
                        "markdown": markdown,
                        "text": markdown,
                        "bbox": rect_to_list(getattr(table, "bbox", [])),
                        "extractionMethod": "pdfplumber.find_tables",
                    }
                )
    return tables, warnings


def element_sort_key(element):
    bbox = element.get("bbox") or []
    top = bbox[1] if len(bbox) >= 2 else 0
    left = bbox[0] if len(bbox) >= 1 else 0
    kind_order = 0 if element.get("kind") == "image" else 1
    return (int(element.get("page") or 0), float(top or 0), float(left or 0), kind_order, int(element.get("index") or 0))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--max-images", type=int, default=120)
    parser.add_argument("--max-image-bytes", type=int, default=25 * 1024 * 1024)
    parser.add_argument("--min-table-cells", type=int, default=6)
    args = parser.parse_args()

    pdf_path = Path(args.input)
    if not pdf_path.exists():
        return emit({"ok": False, "error": f"Input PDF not found: {pdf_path}"}, 1)

    try:
        images, image_warnings, page_count, page_texts = extract_images(str(pdf_path), args.max_images, args.max_image_bytes)
    except Exception as error:
        return emit(
            {
                "ok": False,
                "error": f"PyMuPDF unavailable or failed: {error}",
                "dependency": "pymupdf",
            },
            2,
        )

    tables, table_warnings = extract_tables(str(pdf_path), args.min_table_cells)
    elements = sorted([*images, *tables], key=element_sort_key)
    for sequence, element in enumerate(elements, start=1):
        element["sequence"] = sequence

    return emit(
        {
            "ok": True,
            "pageCount": page_count,
            "text": "\n\n".join(page.get("text", "") for page in page_texts if page.get("text", "")).strip(),
            "pages": page_texts,
            "imageCount": len(images),
            "tableCount": len(tables),
            "elements": elements,
            "warnings": image_warnings + table_warnings,
        }
    )


if __name__ == "__main__":
    sys.exit(main())
