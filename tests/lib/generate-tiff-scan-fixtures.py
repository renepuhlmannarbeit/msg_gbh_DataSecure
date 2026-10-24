"""Synthetic TIFF fixture oracle only; never a product runtime or user file.
Pillow 12.3.0 / libtiff 4.7.1. Emits JSON on stdout; does not write files.
"""
import base64
import hashlib
import io
import json
from PIL import Image, features

cases = []
for name, compression, options in (("tiff_ccitt", "tiff_ccitt", 0), ("group3", "group3", 0),
                                   ("group3_2d", "group3", 1), ("group3_fill", "group3", 4),
                                   ("group3_2d_fill", "group3", 5), ("group4", "group4", 0),
                                   ("tiff_lzw", "tiff_lzw", 0)):
    width, height = (73, 11) if compression != "tiff_lzw" else (257, 17)
    if compression == "tiff_lzw":
        state = 0x45F81A23
        values = []
        for _ in range(width * height):
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
            values.append((state >> 24) & 255)
        image = Image.frombytes("L", (width, height), bytes(values))
    else:
        values = [255 if ((x * 7 + y * 13) % 17 < 9) else 0 for y in range(height) for x in range(width)]
        image = Image.frombytes("L", (width, height), bytes(values)).convert("1", dither=Image.Dither.NONE)
    output = io.BytesIO()
    image.save(output, format="TIFF", compression=compression, tiffinfo={292: options} if compression == "group3" else {})
    reloaded = Image.open(io.BytesIO(output.getvalue()))
    assert reloaded.convert("RGBA").tobytes() == image.convert("RGBA").tobytes()
    if compression == "group3":
        assert reloaded.tag_v2.get(292, 0) == options
    cases.append({"name": name, "width": width, "height": height,
                  "tiff_base64": base64.b64encode(output.getvalue()).decode("ascii"),
                  "rgba_sha256": hashlib.sha256(image.convert("RGBA").tobytes()).hexdigest()})
print(json.dumps({"pillow": Image.__version__, "libtiff": features.version("libtiff"), "cases": cases}, separators=(",", ":")))
