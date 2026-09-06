'use strict';

const { zipStore } = require('./zip');
const { opcControlEntries } = require('./opc');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const run = value => `<w:r><w:t>${value}</w:t></w:r>`;
const paragraph = value => `<w:p>${run(value)}</w:p>`;
const metadata = 'w:id="7" w:author="Erika Beispiel" w:date="2026-08-01T10:00:00Z"';

function reviewDocx(body, { comments, related = true, prefix = 'w', namespace = W } = {}) {
  const qualify = value => value.replaceAll('w:', `${prefix}:`);
  const namespaces = `xmlns:${prefix}="${namespace}" xmlns:mc="${MC}" xmlns:wps="${WPS}" xmlns:shape="${WPS}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:vendor="urn:unsupported"`;
  const entries = [...opcControlEntries('docx', { additionalOverrides: comments === undefined ? [] : [{
    part: 'word/comments.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml'
  }] }), ['word/document.xml', `<${prefix}:document ${namespaces}><${prefix}:body>${qualify(body)}</${prefix}:body></${prefix}:document>`]];
  if (comments !== undefined) {
    entries.push(['word/comments.xml', `<${prefix}:comments ${namespaces}>${qualify(comments)}</${prefix}:comments>`]);
    if (related) entries.push(['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="comments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>']);
  }
  return zipStore(entries);
}

function comment(id = '42', text = 'COMMENT_BODY', authored = false) {
  return `<w:comment w:id="${id}"${authored ? ' w:author="Erika Beispiel" w:initials="EB" w:date="2026-08-01T10:00:00Z"' : ''}><w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>${run(text)}</w:p></w:comment>`;
}

function annotatedParagraph(id = '42', range = true) {
  return `<w:p>${run('BODY_BEFORE')}${range ? `<w:commentRangeStart w:id="${id}"/>` : ''}${run('BODY_ANCHOR')}${range ? `<w:commentRangeEnd w:id="${id}"/>` : ''}<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${id}"/></w:r>${run('BODY_AFTER')}</w:p>`;
}

function propertyRevisions() {
  const changed = (name, old) => `<w:${name} ${metadata}>${old}</w:${name}>`;
  const cell = property => `<w:tbl><w:tr><w:tc><w:tcPr>${property}</w:tcPr>${paragraph('VISIBLE_CONTROL')}</w:tc></w:tr></w:tbl>`;
  return [
    ['pPrChange', `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${changed('pPrChange', '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>')}</w:pPr>${run('VISIBLE_CONTROL')}</w:p>`],
    ['rPrChange', `<w:p><w:r><w:rPr><w:b/>${changed('rPrChange', '<w:rPr><w:i/></w:rPr>')}</w:rPr><w:t>VISIBLE_CONTROL</w:t></w:r></w:p>`],
    ['sectPrChange', paragraph('VISIBLE_CONTROL') + `<w:sectPr>${changed('sectPrChange', '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>')}</w:sectPr>`],
    ['tblPrChange', `<w:tbl><w:tblPr>${changed('tblPrChange', '<w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>')}</w:tblPr><w:tr><w:tc>${paragraph('VISIBLE_CONTROL')}</w:tc></w:tr></w:tbl>`],
    ['tblGridChange', `<w:tbl><w:tblGrid><w:gridCol w:w="1000"/>${changed('tblGridChange', '<w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>')}</w:tblGrid><w:tr><w:tc>${paragraph('VISIBLE_CONTROL')}</w:tc></w:tr></w:tbl>`],
    ['trPrChange', `<w:tbl><w:tr><w:trPr>${changed('trPrChange', '<w:trPr><w:tblHeader/></w:trPr>')}</w:trPr><w:tc>${paragraph('VISIBLE_CONTROL')}</w:tc></w:tr></w:tbl>`],
    ['tcPrChange', cell(changed('tcPrChange', '<w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr>'))],
    ['tblPrExChange', `<w:tbl><w:tr><w:tblPrEx>${changed('tblPrExChange', '<w:tblPrEx><w:tblW w:w="0" w:type="auto"/></w:tblPrEx>')}</w:tblPrEx><w:tc>${paragraph('VISIBLE_CONTROL')}</w:tc></w:tr></w:tbl>`],
    ['numberingChange', `<w:p><w:pPr><w:numPr><w:numberingChange ${metadata} w:original="1."/></w:numPr></w:pPr>${run('VISIBLE_CONTROL')}</w:p>`],
    ...['cellIns', 'cellDel', 'cellMerge'].map(name => [name, cell(`<w:${name} ${metadata}/>`)] )
  ];
}

function invalidAlternateDocx() {
  return reviewDocx(`<mc:AlternateContent><mc:ChoiceSupported Requires="vendor">${paragraph('WRONG_SELECTED')}</mc:ChoiceSupported><mc:Fallback>${paragraph('EXPECTED_FALLBACK')}</mc:Fallback></mc:AlternateContent>`);
}

module.exports = { W, WPS, MC, run, paragraph, reviewDocx, comment, annotatedParagraph, propertyRevisions, invalidAlternateDocx };
