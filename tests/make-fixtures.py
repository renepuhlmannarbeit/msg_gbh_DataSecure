from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import struct, zlib, binascii
root=Path(__file__).parent/'fixtures';root.mkdir(parents=True,exist_ok=True)

def png_blank(w=300,h=120):
    sig=b'\x89PNG\r\n\x1a\n'
    def chunk(t,d):
        return struct.pack('>I',len(d))+t+d+struct.pack('>I',binascii.crc32(t+d)&0xffffffff)
    ihdr=struct.pack('>IIBBBBB',w,h,8,6,0,0,0)
    row=b'\x00'+bytes([255,255,255,255])*w
    raw=row*h
    return sig+chunk(b'IHDR',ihdr)+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
img=png_blank()
# DOCX
with ZipFile(root/'synthetic_profile.docx','w',ZIP_DEFLATED) as z:
    z.writestr('word/document.xml','''<w:document xmlns:w="w" xmlns:r="r" xmlns:a="a"><w:body>
    <w:p><w:r><w:t>Unternehmen: Beispiel Consulting GmbH</w:t></w:r></w:p>
    <w:p><w:r><w:t>Standort: Köln</w:t></w:r></w:p>
    <w:p><w:r><w:t>MAX MUSTERMANN</w:t></w:r></w:p>
    <w:p><w:r><w:t>Product Owner</w:t></w:r></w:p>
    <w:p><w:r><w:t>Skillset</w:t></w:r></w:p>
    <w:p><w:r><w:t>Projekterfahrung</w:t></w:r></w:p>
    <w:p><w:r><w:t>Kunde Alpha GmbH – Einführung Portal X</w:t></w:r></w:p>
    <w:p><w:r><w:t>Zeitraum: 01/2024 – 08/2026</w:t></w:r></w:p>
    <w:p><w:r><w:t>Rolle im Projekt: Business Analyst</w:t></w:r></w:p>
    <w:p><w:r><w:t>Berufserfahrung</w:t></w:r></w:p>
    </w:body></w:document>''')
    z.writestr('word/media/image1.png',img)
# XLSX
with ZipFile(root/'synthetic_customer.xlsx','w',ZIP_DEFLATED) as z:
    z.writestr('xl/workbook.xml','''<workbook xmlns:r="r"><sheets><sheet name="Kunden" r:id="rId1"/></sheets></workbook>''')
    z.writestr('xl/_rels/workbook.xml.rels','''<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>''')
    z.writestr('xl/sharedStrings.xml','''<sst><si><t>Kunde</t></si><si><t>Max Mustermann</t></si><si><t>E-Mail</t></si><si><t>max@example.de</t></si><si><t>Status</t></si><si><t>Offen</t></si></sst>''')
    z.writestr('xl/worksheets/sheet1.xml','''<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row></sheetData></worksheet>''')
    z.writestr('xl/media/image1.png',img)
# PPTX
with ZipFile(root/'synthetic_contract.pptx','w',ZIP_DEFLATED) as z:
    z.writestr('ppt/slides/slide1.xml','''<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Vertrag zwischen Alpha GmbH und Max Mustermann</a:t></a:r></a:p><a:p><a:r><a:t>Haftung und Kündigung</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>''')
    z.writestr('ppt/notesSlides/notesSlide1.xml','''<p:notes xmlns:p="p" xmlns:a="a"><a:t>Kontakt max@example.de</a:t></p:notes>''')
    z.writestr('ppt/media/image1.png',img)
# simple PDF with text layer
content='BT /F1 12 Tf 72 720 Td (Kunde: Max Mustermann) Tj 0 -20 Td (E-Mail: max@example.de) Tj ET'
objs=[]
objs.append('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n')
objs.append('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n')
objs.append('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n')
objs.append(f'4 0 obj << /Length {len(content)} >> stream\n{content}\nendstream endobj\n')
objs.append('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n')
body='%PDF-1.4\n'+''.join(objs)+'%%EOF\n'
(root/'synthetic_customer.pdf').write_bytes(body.encode('latin1'))
print('fixtures created',root)
