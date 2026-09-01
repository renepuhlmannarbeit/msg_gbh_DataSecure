'use strict';

const TYPES = Object.freeze({
  docx: Object.freeze({ part: 'word/document.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' }),
  xlsx: Object.freeze({ part: 'xl/workbook.xml', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' }),
  pptx: Object.freeze({ part: 'ppt/presentation.xml', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml' })
});

function opcControlEntries(kind, { standardPackageMetadata = false, additionalOverrides = [] } = {}) {
  const type = TYPES[kind];
  if (!type) throw new Error('unknown OPC test type');
  const contentTypes = [
    `<Override PartName="/${type.part}" ContentType="${type.contentType}"/>`,
    ...additionalOverrides.map(({ part, contentType }) =>
      `<Override PartName="/${part}" ContentType="${contentType}"/>`)
  ];
  const relationships = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${type.part}"/>`
  ];
  const metadataEntries = [];
  if (standardPackageMetadata) {
    contentTypes.push(
      '<Default Extension="jpeg" ContentType="image/jpeg"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
    );
    relationships.push(
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/>'
    );
    metadataEntries.push(
      ['docProps/core.xml', '<cp:coreProperties xmlns:cp="urn:test"/>'],
      ['docProps/app.xml', '<Properties xmlns="urn:test"/>'],
      ['docProps/thumbnail.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])]
    );
  }
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`],
    ...metadataEntries
  ];
}

module.exports = { opcControlEntries, TYPES };
