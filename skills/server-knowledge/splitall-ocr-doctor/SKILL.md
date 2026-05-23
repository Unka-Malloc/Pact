---
name: splitall-ocr-doctor
description: Use when diagnosing SplitAll OCR setup, PaddleOCR Python runtime, OCR script packaging, OCR language settings, or image and scanned PDF extraction failures.
---

# SplitAll OCR Doctor

## Purpose

Validate the OCR runtime before changing ingestion, mount routing, or client code.

## Workflow

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-knowledge/splitall-ocr-doctor/scripts/splitall-ocr-doctor.mjs \
  --repo /Users/unka/DevSpace/Unka-Malloc/Pact
```

With a sample image or scanned PDF:

```bash
node /Users/unka/DevSpace/Unka-Malloc/Pact/skills/server-knowledge/splitall-ocr-doctor/scripts/splitall-ocr-doctor.mjs \
  --repo /Users/unka/DevSpace/Unka-Malloc/Pact \
  --sample scan.png
```

## Checks

- `new/server/ocr.mjs` exists.
- `ocr/paddle_ocr_extract.py` exists.
- Python runtime is callable.
- Optional sample call reaches `extractTextWithPaddleOcr`.
