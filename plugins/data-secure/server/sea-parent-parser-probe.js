'use strict';

// Synthetic engineering probe only. The SEA bootstrap admits exactly one
// fixed CLI flag and verifies the bound server files before loading this file.
// No user document, path, parser override or test-helper import is accepted.
const { isSea } = require('node:sea');
const { convertDocument } = require('./runtime');

const DOCX_BASE64 = 'UEsDBBQAAAgAAAAAAACRp0i1AgEAAAIBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04Ij8+PFR5cGVzIHhtbG5zPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvcGFja2FnZS8yMDA2L2NvbnRlbnQtdHlwZXMiPjxPdmVycmlkZSBQYXJ0TmFtZT0iL3dvcmQvZG9jdW1lbnQueG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LndvcmRwcm9jZXNzaW5nbWwuZG9jdW1lbnQubWFpbit4bWwiLz48L1R5cGVzPlBLAwQUAAAIAAAAAAAANlfe3BgBAAAYAQAACwAAAF9yZWxzLy5yZWxzPD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48UmVsYXRpb25zaGlwcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzIj48UmVsYXRpb25zaGlwIElkPSJySWQxIiBUeXBlPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL29mZmljZURvY3VtZW50IiBUYXJnZXQ9IndvcmQvZG9jdW1lbnQueG1sIi8+PC9SZWxhdGlvbnNoaXBzPlBLAwQUAAAIAAAAAAAA5YbOA60AAACtAAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPHc6ZG9jdW1lbnQgeG1sbnM6dz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3dvcmRwcm9jZXNzaW5nbWwvMjAwNi9tYWluIj48dzpib2R5Pjx3OnA+PHc6cj48dzp0PlNFQV9QQVJFTlRfU1lOVEhFVElDX0NBTkFSWTwvdzp0PjwvdzpyPjwvdzpwPjwvdzpib2R5Pjwvdzpkb2N1bWVudD5QSwECFAAUAAAIAAAAAAAAkadItQIBAAACAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAgAAAAAAAA2V97cGAEAABgBAAALAAAAAAAAAAAAAAAAADMBAABfcmVscy8ucmVsc1BLAQIUABQAAAgAAAAAAADlhs4DrQAAAK0AAAARAAAAAAAAAAAAAAAAAHQCAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAABQAwAAAAA=';
const CANARY = 'SEA_PARENT_SYNTHETIC_CANARY';
const FORMATS = Object.freeze(['txt', 'md', 'markdown', 'csv', 'docx']);
const TARGETS = Object.freeze({ 'win32/x64': 'windows-x64', 'darwin/x64': 'macos-x64',
  'darwin/arm64': 'macos-arm64', 'linux/x64': 'linux-x64' });

async function runParentParserProbe() {
  const target = TARGETS[`${process.platform}/${process.arch}`];
  if (!isSea() || !target || process.argv.length !== 3 ||
      process.argv[2] !== '--datasecure-parser-integration-probe') {
    throw new Error('SEA_PARENT_PARSER_PROBE_CONTEXT_INVALID');
  }
  const firstResults = new Map();
  // Two full rounds exercise subsequent parser selections in the same genuine
  // parent process. Only synthetic buffers cross the normal runtime boundary.
  for (let round = 0; round < 2; round++) {
    for (const format of FORMATS) {
      const inputBuffer = format === 'docx' ? Buffer.from(DOCX_BASE64, 'base64') :
        Buffer.from(format === 'csv' ? `Kind;Value\nSynthetic;${CANARY}\n` : `${CANARY}\n`);
      let parsed;
      try {
        parsed = await convertDocument('', { inputBuffer, sourceName: `synthetic.${format}` });
      } catch {
        throw new Error('SEA_PARENT_PARSER_PROBE_CONVERSION_FAILED');
      }
      if (typeof parsed?.markdown !== 'string' || !parsed.markdown.includes(CANARY) ||
          !Array.isArray(parsed.warnings) || parsed.warnings.length !== 0 ||
          !Array.isArray(parsed.attachments) || parsed.attachments.length !== 0) {
        throw new Error('SEA_PARENT_PARSER_PROBE_RESULT_INVALID');
      }
      const serialized = JSON.stringify(parsed);
      if (round === 0) firstResults.set(format, serialized);
      else if (firstResults.get(format) !== serialized) throw new Error('SEA_PARENT_PARSER_PROBE_REPEAT_MISMATCH');
    }
  }
  return { schema: 'datasecure-sea-parent-parser-probe/v1', target, parent_sea: true,
    formats: [...FORMATS], privacy_release_verified: false };
}

module.exports = { runParentParserProbe };
