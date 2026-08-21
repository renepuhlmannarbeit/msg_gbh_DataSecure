'use strict';

const path = require('path');
const { normalizeText } = require('./privacy/base');
const { parseOoxml } = require('./ooxml');
const { parsePdf } = require('./pdf-lite');

function normalized(result) {
  return { ...result, markdown: normalizeText(result.markdown) };
}

function parseDocumentBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('parser input must be a buffer');
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) return normalized(parseOoxml(buffer, ext));
  if (ext === '.pdf') return normalized(parsePdf(buffer));
  if (ext === '.md' || ext === '.txt') {
    return normalized({ markdown: buffer.toString('utf8'), attachments: [], warnings: [] });
  }
  if (ext === '.csv') {
    const body = buffer.toString('utf8').replace(/```/g, '` ` `');
    return normalized({ markdown: `# Tabelleninhalt\n\n\`\`\`csv\n${body}\n\`\`\``, attachments: [], warnings: [] });
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
    });
  }
  throw new Error('unsupported_format');
}

module.exports = { parseDocumentBuffer };
