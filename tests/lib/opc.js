'use strict';

const TYPES = Object.freeze({
  docx: Object.freeze({ part: 'word/document.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' }),
  xlsx: Object.freeze({ part: 'xl/workbook.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' }),
  pptx: Object.freeze({ part: 'ppt/presentation.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml' })
});

function opcControlEntries(kind) {
  const type = TYPES[kind];
  if (!type) throw new Error('unknown OPC test type');
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${type.part}" ContentType="${type.contentType}"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${type.part}"/></Relationships>`]
  ];
}

module.exports = { opcControlEntries, TYPES };
