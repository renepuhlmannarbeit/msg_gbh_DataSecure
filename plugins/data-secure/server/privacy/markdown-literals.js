'use strict';

// Linear delimiter scanning: unmatched runs must not trigger source-sized
// backtracking. Literal contents are restored before privacy detection.
function shieldMarkdownLiterals(source, shield, literalMarkdown) {
  const inlineParagraph = text => {
    const runs = []; let backslashes = 0;
    for (let index = 0; index < text.length;) {
      if (text[index] === '\\') { backslashes++; index++; continue; }
      if (text[index] !== '`') { backslashes = 0; index++; continue; }
      const start = index; while (text[index] === '`') index++;
      runs.push({ start, end: index, length: index - start, escaped: backslashes % 2 === 1 });
      backslashes = 0;
    }
    const next = new Map();
    for (let index = runs.length - 1; index >= 0; index--) {
      runs[index].close = next.get(runs[index].length); next.set(runs[index].length, index);
    }
    const output = []; let from = 0;
    for (let index = 0; index < runs.length;) {
      const opening = runs[index];
      if (opening.escaped || opening.close === undefined) { index++; continue; }
      const closing = runs[opening.close];
      // Inside a code span a backslash is literal, not a closing escape.
      // CommonMark turns line endings into spaces, even over several lines.
      let body = text.slice(opening.end, closing.start).replace(/\r\n|\r|\n/gu, ' ');
      if (body.startsWith(' ') && body.endsWith(' ') && /[^ ]/u.test(body)) body = body.slice(1,-1);
      output.push(text.slice(from, opening.start), shield(literalMarkdown(body)));
      from = closing.end; index = opening.close + 1;
    }
    output.push(text.slice(from)); return output.join('');
  };
  const inlineText = text => {
    const output = []; let from = 0;
    // Inline code cannot cross a paragraph boundary or a fenced block.
    for (const gap of text.matchAll(/(?:\r\n|\r(?!\n)|(?<!\r)\n)[ \t]*(?:\r\n|\r(?!\n)|(?<!\r)\n)/gu)) {
      output.push(inlineParagraph(text.slice(from, gap.index)), gap[0]);
      from = gap.index + gap[0].length;
    }
    output.push(inlineParagraph(text.slice(from))); return output.join('');
  };
  const pieces = []; let cursor = 0, fence = null;
  for (const line of source.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/gu)) {
    if (!line[0].length) continue;
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line[1]);
    if (!fence && match && (match[1][0] !== '`' || !match[2].includes('`'))) {
      fence = { start: line.index, character: match[1][0], length: match[1].length };
    } else if (fence && match && match[1][0] === fence.character && match[1].length >= fence.length && /^[ \t]*$/u.test(match[2])) {
      pieces.push(inlineText(source.slice(cursor, fence.start)), shield(source.slice(fence.start, line.index + line[0].length)));
      cursor = line.index + line[0].length; fence = null;
    }
  }
  if (fence) { pieces.push(inlineText(source.slice(cursor, fence.start)), shield(source.slice(fence.start))); cursor = source.length; }
  pieces.push(inlineText(source.slice(cursor))); return pieces.join('');
}
module.exports = { shieldMarkdownLiterals };
