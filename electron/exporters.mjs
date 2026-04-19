import fs from "node:fs/promises";
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun
} from "docx";

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    children: [new TextRun(text)]
  });
}

function paragraph(text, spacingAfter = 120) {
  return new Paragraph({
    spacing: {
      after: spacingAfter
    },
    children: [new TextRun(text)]
  });
}

function buildMarkdown(result) {
  const lines = [
    "# SplitAll 输出",
    "",
    `生成时间：${result.generatedAt}`,
    "",
    "## 知识文档"
  ];

  for (const doc of result.documents) {
    lines.push(`### ${doc.title}`);
    lines.push(`- 来源：${doc.source}`);
    lines.push(`- 时间戳：${doc.timestamp}`);
    lines.push(`- 标签：${doc.tags.join("、") || "无"}`);
    lines.push("");
    lines.push(doc.content);
    lines.push("");
  }

  lines.push("## 模拟问答对");
  lines.push("");

  for (const qa of result.qaPairs) {
    lines.push(`### Q: ${qa.question}`);
    lines.push(`- 来源：${qa.source}`);
    lines.push(`- 时间戳：${qa.timestamp}`);
    lines.push(`- 关联知识单元：${qa.documentTitles.join("、") || "无"}`);
    lines.push("");
    lines.push(`A: ${qa.answer}`);
    lines.push("");
  }

  return lines.join("\n");
}

function createSerializableResult(result) {
  return {
    generatedAt: result.generatedAt,
    warnings: result.warnings,
    documents: result.documents,
    qaPairs: result.qaPairs,
    chunks: result.chunks || [],
    sourceFiles: result.sourceFiles.map((source) => ({
      id: source.id,
      name: source.name,
      path: source.path,
      kind: source.kind,
      text: source.kind === "image" ? "" : source.text || "",
      mediaType: source.mediaType || ""
    }))
  };
}

function resolveImageBuffer(source) {
  if (source.imageBuffer) {
    return source.imageBuffer;
  }

  if (!source.imageDataUrl) {
    return null;
  }

  const match = source.imageDataUrl.match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    return null;
  }

  return Buffer.from(match[1], "base64");
}

async function buildDocxBuffer(result) {
  const children = [
    heading("SplitAll 输出"),
    paragraph(`生成时间：${result.generatedAt}`),
    heading("知识文档"),
    ...result.documents.flatMap((doc) => [
      heading(doc.title, HeadingLevel.HEADING_2),
      paragraph(`来源：${doc.source}`),
      paragraph(`时间戳：${doc.timestamp}`),
      paragraph(`标签：${doc.tags.join("、") || "无"}`),
      paragraph(doc.content, 240)
    ]),
    heading("模拟问答对"),
    ...result.qaPairs.flatMap((qa) => [
      heading(qa.question, HeadingLevel.HEADING_2),
      paragraph(`来源：${qa.source}`),
      paragraph(`时间戳：${qa.timestamp}`),
      paragraph(`关联知识单元：${qa.documentTitles.join("、") || "无"}`),
      paragraph(`回答：${qa.answer}`, 240)
    ])
  ];

  const imageSources = result.sourceFiles.filter((source) => source.kind === "image");
  if (imageSources.length > 0) {
    children.push(heading("原始图片附件"));

    for (const source of imageSources) {
      const imageBuffer = resolveImageBuffer(source);
      if (!imageBuffer) {
        continue;
      }

      children.push(heading(source.name, HeadingLevel.HEADING_2));
      children.push(paragraph(`来源路径：${source.path || "未记录"}`));
      children.push(
        new Paragraph({
          spacing: { after: 240 },
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation: {
                width: 480,
                height: 320
              }
            })
          ]
        })
      );
    }
  }

  const document = new Document({
    sections: [
      {
        children
      }
    ]
  });

  return Packer.toBuffer(document);
}

function buildJsonBuffer(result) {
  return Buffer.from(
    JSON.stringify(createSerializableResult(result), null, 2),
    "utf8"
  );
}

function buildMarkdownBuffer(result) {
  return Buffer.from(buildMarkdown(result), "utf8");
}

function buildDownloadName(result, extension) {
  return `splitall-${result.generatedAt.replace(/[:.]/g, "-")}.${extension}`;
}

export async function buildResultArtifact(result, format) {
  if (format === "json") {
    return {
      buffer: buildJsonBuffer(result),
      contentType: "application/json; charset=utf-8",
      fileName: buildDownloadName(result, "json")
    };
  }

  if (format === "md") {
    return {
      buffer: buildMarkdownBuffer(result),
      contentType: "text/markdown; charset=utf-8",
      fileName: buildDownloadName(result, "md")
    };
  }

  if (format === "docx") {
    return {
      buffer: await buildDocxBuffer(result),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: buildDownloadName(result, "docx")
    };
  }

  throw new Error(`不支持的导出格式：${format}`);
}

export async function writeResultToFile(result, format, filePath) {
  const artifact = await buildResultArtifact(result, format);
  await fs.writeFile(filePath, artifact.buffer);
  return artifact;
}
