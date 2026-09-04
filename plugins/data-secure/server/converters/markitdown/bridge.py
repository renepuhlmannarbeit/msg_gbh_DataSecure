#!/usr/bin/env python3
"""Private MarkItDown bridge. Raw input/output use inherited stdio only."""

from __future__ import annotations

import io
import os
import pathlib
import socket
import sys

MAX_INPUT_BYTES = 100 * 1024 * 1024
MAX_OUTPUT_CHARS = 64 * 1024 * 1024


class _NetworkDeniedSocket(socket.socket):
    def connect(self, *args, **kwargs):  # noqa: ANN002, ANN003
        raise OSError("network disabled")

    def connect_ex(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return 13


def _runtime_root() -> pathlib.Path:
    bundled = pathlib.Path(__file__).resolve().parent / "runtime" / "site-packages"
    if bundled.is_dir():
        return bundled
    if os.environ.get("DATASECURE_ENGINEERING_MODE") == "1":
        engineering = pathlib.Path(os.environ.get("DATASECURE_ENGINEERING_MARKITDOWN_ROOT", ""))
        if engineering.is_absolute() and engineering.is_dir():
            return engineering
    raise RuntimeError("runtime unavailable")


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1].lower() != ".docx":
        raise RuntimeError("format blocked")
    sys.path.insert(0, str(_runtime_root()))
    socket.socket = _NetworkDeniedSocket
    from markitdown import MarkItDown, StreamInfo  # pylint: disable=import-outside-toplevel
    from markitdown.converters import DocxConverter  # pylint: disable=import-outside-toplevel

    payload = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(payload) > MAX_INPUT_BYTES:
        raise RuntimeError("input too large")
    converter = MarkItDown(enable_builtins=False, enable_plugins=False)
    converter.register_converter(DocxConverter())
    result = converter.convert_stream(io.BytesIO(payload), stream_info=StreamInfo(extension=".docx"))
    markdown = result.markdown
    if not isinstance(markdown, str) or len(markdown) > MAX_OUTPUT_CHARS:
        raise RuntimeError("output invalid")
    sys.stdout.write(markdown)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:  # No traceback, paths or parser-controlled values cross the boundary.
        sys.stderr.write("MARKITDOWN_CONVERSION_STOPPED\n")
        raise SystemExit(65)
