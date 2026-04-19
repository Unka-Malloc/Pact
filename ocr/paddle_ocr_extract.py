#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract text from image/PDF with PaddleOCR.")
    parser.add_argument("--input", required=True, help="Absolute path to an image or PDF file.")
    parser.add_argument(
        "--file-type",
        choices=("image", "pdf"),
        required=True,
        help="Input file type.",
    )
    parser.add_argument(
        "--lang",
        default=os.environ.get("SPLITALL_PADDLEOCR_LANG", "ch"),
        help="PaddleOCR language code, defaults to ch.",
    )
    return parser.parse_args()


def emit(payload: dict, exit_code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    raise SystemExit(exit_code)


def get_ocr(lang: str):
    try:
        from paddleocr import PaddleOCR
    except Exception as error:  # pragma: no cover - runtime environment dependent
        emit(
            {
                "error": (
                    "未安装 PaddleOCR 运行环境。请先创建 .venv-paddleocr，"
                    "并安装 paddlepaddle 与 paddleocr。"
                ),
                "details": str(error),
            },
            2,
        )

    os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")

    return PaddleOCR(
        lang=lang,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def extract_page(result_item) -> dict:
    payload = getattr(result_item, "json", None)
    if callable(payload):
        payload = payload()

    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = None

    if not isinstance(payload, dict):
        return {"text": "", "pageIndex": None, "lines": []}

    if "res" in payload and isinstance(payload["res"], dict):
        payload = payload["res"]

    rec_texts = payload.get("rec_texts") or []
    if not isinstance(rec_texts, list):
        rec_texts = []

    lines = [str(item).strip() for item in rec_texts if str(item).strip()]
    return {
        "text": "\n".join(lines),
        "pageIndex": payload.get("page_index"),
        "lines": lines,
    }


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).expanduser().resolve()

    if not input_path.is_file():
        emit({"error": f"输入文件不存在：{input_path}"}, 1)

    try:
        ocr = get_ocr(args.lang)
        result = ocr.predict(str(input_path))
        pages = [extract_page(item) for item in result]
        text = "\n\n".join(page["text"] for page in pages if page["text"].strip())
        emit(
            {
                "text": text.strip(),
                "pages": pages,
                "fileType": args.file_type,
                "inputPath": str(input_path),
            }
        )
    except SystemExit:
        raise
    except Exception as error:  # pragma: no cover - runtime environment dependent
        emit(
            {
                "error": "PaddleOCR 识别失败。",
                "details": str(error),
            },
            1,
        )


if __name__ == "__main__":
    main()
