# Supported formats

Local preflight supports PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPEG and BMP. Scanned PDFs are supported when their JPEG page images can be extracted safely; otherwise they stop fail-closed. Image-only inputs and scan PDFs without a text layer require an explicit privacy profile because auto-detection cannot safely classify them before local OCR. Only automatically verified visual assets may be released. Every other visual stays local under `Needs Visual Review`; this engineering build intentionally exposes no human visual-release path through Claude or MCP.

TXT and textually complete DOCX files additionally support the private local file-picker and, on Windows, the redaction-only text-review workflow. Other formats currently use the `Input` folder path.
