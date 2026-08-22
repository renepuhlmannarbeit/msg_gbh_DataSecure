'use strict';

const path = require('path');
const { normalizeText } = require('./privacy/base');
const { parseOoxml } = require('./ooxml');
const { createContentGraph } = require('./content-graph');

function normalized(result, ext) {
  const value = { ...result, markdown: normalizeText(result.markdown).replace(/\r\n?/gu, '\n') };
  return { ...value, content_graph: createContentGraph(value.markdown, value.attachments, ext) };
}

function parseDocumentBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parser input must be a buffer');
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) return normalized(parseOoxml(buffer, ext), ext);
  if (ext === '.md' || ext === '.txt') {
    return normalized({ markdown: buffer.toString('utf8'), attachments: [], warnings: [] }, ext);
  }
  if (ext === '.csv') {
    const body = buffer.toString('utf8').replace(/```/g, '` ` `');
    return normalized({ markdown: `# Tabelleninhalt\n\n\`\`\`csv\n${body}\n\`\`\``, attachments: [], warnings: [] }, ext);
  }
  if (['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
    const mimeType = ext === '.png' ? 'image/png' : ext === '.bmp' ? 'image/bmp' : 'image/jpeg';
    return normalized({
      markdown: '# Bildinhalt\n\n> Der fachliche Bildtext wird lokal per OCR extrahiert und durch dieselbe Datenschutzprüfung verarbeitet.',
      attachments: [{
        type: 'image', mimeType, data: buffer.toString('base64'),
        name: `local-image${ext}`, extension: ext.slice(1), source_part: 'standalone-image'
      }],
      warnings: [],
      requiresExplicitProfile: true
    }, ext);
  }
  throw new Error('unsupported_format');
}

module.exports = { parseDocumentBuffer };
