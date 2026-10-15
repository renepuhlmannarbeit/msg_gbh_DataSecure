'use strict';

// Undefined retains the old journal/converter contract. No global default:
// a new profile must be explicitly bound by intake before it reaches here.
function validateMarkdownOutput(value) {
  if (value !== undefined && !['content-v1', 'notes-v1'].includes(value)) {
    throw Object.assign(new Error('CONVERSION_INPUT_INVALID'), { code: 'CONVERSION_INPUT_INVALID' });
  }
  return value;
}

function officeContent(sections) {
  return sections.map(section => {
    const part = section.source_part.split('!/').at(-1);
    let label;
    if (/^(?:xl|ppt)\/charts\/chart[0-9]+\.xml$/u.test(part)) label = 'Diagrammdaten';
    else if (/^xl\/drawings\/drawing[0-9]+\.xml$/u.test(part)) label = 'Grafiktext';
    else if (/^ppt\/slideLayouts\/slideLayout[0-9]+\.xml$/u.test(part)) label = 'Folienlayout';
    else if (/^ppt\/slideMasters\/slideMaster[0-9]+\.xml$/u.test(part)) label = 'Folienmaster';
    const basename = part.split('/').at(-1);
    const generated = label && `## ${label} ${basename}\n\n`;
    // Only parser-owned label with matching source provenance; never search
    // arbitrary page text for strings that resemble an internal filename.
    return generated && section.markdown.startsWith(generated)
      ? `## ${label}\n\n${section.markdown.slice(generated.length)}` : section.markdown;
  }).join('\n\n');
}

module.exports = Object.freeze({ validateMarkdownOutput, officeContent });
