#!/usr/bin/env python3
"""Generate only synthetic files for the DataSecure human acceptance kit."""
from __future__ import annotations

import argparse
import csv
import shutil
import struct
import zipfile
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-data" / "generated"
REPOSITORY = Path(__file__).resolve().parents[4]
SYNTHETIC_IMAGE = REPOSITORY / "tests" / "fixtures" / "synthetic_scan.png"

PROFILE = """# Mitarbeiterprofil – vollständig synthetisch

Name: Lina Testfeld
E-Mail: lina.testfeld@privacy-example.test
Telefon: +49 221 555 0182
IBAN: DE89 3704 0044 0532 0130 00
Arbeitgeber: Nordstern Medizin IT GmbH
Kunde: Falken Klinikverbund AG
Rolle: Product Owner
Technologien: Java, SQL, HL7 FHIR, Testautomatisierung
Zertifizierungen:
- ISTQB Certified Tester Foundation Level
- Scrum.org Professional Scrum Master II (PSM II)
Leistungsinhalt: Qualitätsgesicherte Weiterentwicklung eines klinischen Terminservices.
"""

AMBIGUOUS = """# Zertifikatsnachweis – vollständig synthetisch

Name: Mara Beispiel
E-Mail: mara.beispiel@privacy-example.test
Organisation: Nordstern Akademie GmbH
Zertifizierung: Nordstern Akademie GmbH Certified Healthcare Product Owner
Rolle: Product Owner

Die Organisation kann im Kontext Zertifikatsanbieter oder Arbeitgeber sein. Der Test
erwartet eine sichere lokale Entscheidung oder einen dokumentierten sicheren Stopp.
"""

def clean_output() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for folder in ("01-positive", "02-review", "03-blocked", "04-batch-100"):
        (OUT / folder).mkdir(parents=True, exist_ok=True)

def write_text_files() -> None:
    positive = OUT / "01-positive"
    (positive / "personnel-profile.txt").write_text(PROFILE, encoding="utf-8")
    (positive / "personnel-profile.md").write_text(PROFILE, encoding="utf-8")
    with (positive / "personnel-profile.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Feld", "Wert"])
        writer.writerows([
            ["Name", "Lina Testfeld"], ["E-Mail", "lina.testfeld@privacy-example.test"],
            ["Telefon", "+49 221 555 0182"], ["IBAN", "DE89 3704 0044 0532 0130 00"],
            ["Arbeitgeber", "Nordstern Medizin IT GmbH"], ["Kunde", "Falken Klinikverbund AG"],
            ["Rolle", "Product Owner"], ["Technologien", "Java, SQL, HL7 FHIR, Testautomatisierung"],
            ["Zertifizierung", "ISTQB Certified Tester Foundation Level"],
            ["Zertifizierung", "Scrum.org Professional Scrum Master II (PSM II)"],
        ])
    (OUT / "02-review" / "ambiguous-certificate-provider.txt").write_text(AMBIGUOUS, encoding="utf-8")

def set_run(run, size=11, bold=False):
    run.font.name = "Calibri"
    run.font.size = Pt(size)
    run.bold = bold

def make_docx(destination: Path, with_image: bool = False) -> None:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = section.bottom_margin = Inches(1)
    section.left_margin = section.right_margin = Inches(1)
    title = doc.add_paragraph()
    title.paragraph_format.space_after = Pt(8)
    set_run(title.add_run("Mitarbeiterprofil – vollständig synthetisch"), 16, True)
    for line in PROFILE.splitlines()[2:]:
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(4)
        set_run(paragraph.add_run(line))
    if with_image:
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(10)
        set_run(paragraph.add_run("Eingebettete Grafik (synthetische Testgrafik):"), 11, True)
        # Repository fixture: valid, wholly synthetic, used only to test local hold.
        doc.add_picture(str(SYNTHETIC_IMAGE), width=Inches(1.5))
    doc.core_properties.author = "DataSecure synthetic acceptance kit"
    doc.core_properties.title = "Synthetic DataSecure acceptance fixture"
    doc.save(destination)

def make_blocked_files() -> None:
    blocked = OUT / "03-blocked"
    # Well-formed minimal PDF: current product policy must still reject it.
    (blocked / "blocked-text.pdf").write_bytes(
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
    )
    # Valid ZIP containers carrying the usual roots; they are intentionally outside
    # the released format set and therefore must stop before content processing.
    for name, root in (("blocked-workbook.xlsx", "xl/workbook.xml"), ("blocked-slides.pptx", "ppt/presentation.xml")):
        with zipfile.ZipFile(blocked / name, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("[Content_Types].xml", "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'/>")
            archive.writestr(root, "<root/>")
    shutil.copyfile(SYNTHETIC_IMAGE, blocked / "blocked-image.png")
    # Not a ZIP on purpose: validates fail-closed DOCX coverage handling.
    (blocked / "malformed.docx").write_text("This is intentionally not an OOXML ZIP.", encoding="utf-8")

def make_batch(count: int = 100, large: bool = False) -> None:
    folder = OUT / ("05-batch-500mb" if large else "04-batch-100")
    folder.mkdir(parents=True, exist_ok=True)
    # 65,000 lines make roughly 4.7 MB per file: 100 files stay below the
    # documented 500-MB batch ceiling while exercising its near-limit preflight.
    payload = "\n".join(["Fachlicher Kontext: Testautomatisierung und HL7 FHIR bleiben erhalten."] * (65000 if large else 1))
    for index in range(1, count + 1):
        name = f"batch-{index:03}.txt"
        text = f"""# Synthetischer Batchfall {index}
Name: Testperson {index}
E-Mail: batch-{index:03}@privacy-example.test
Telefon: +49 30 7000{index:04}
IBAN: DE89 3704 0044 0532 0130 00
Kunde: Testfirma {index} GmbH
Rolle: Testmanager
Zertifizierung: ISTQB Certified Tester Foundation Level
{payload}
"""
        (folder / name).write_text(text, encoding="utf-8")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-500mb-batch", action="store_true")
    args = parser.parse_args()
    clean_output()
    write_text_files()
    make_docx(OUT / "01-positive" / "personnel-profile.docx")
    make_docx(OUT / "02-review" / "personnel-profile-with-image.docx", with_image=True)
    make_blocked_files()
    make_batch()
    if args.with_500mb_batch:
        make_batch(large=True)
    print(f"Synthetic acceptance data created: {OUT}")

if __name__ == "__main__":
    main()
