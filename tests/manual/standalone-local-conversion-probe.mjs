// Read-only, content-free reproduction with the projected native converter.
// Usage: node tests/manual/standalone-local-conversion-probe.mjs <source>...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeStandaloneRuntime } from '../../scripts/lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from '../../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from '../helpers/standalone-package-scope.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64' : null;
if (!target || process.argv.length < 3) throw new Error('LOCAL_CONVERSION_PROBE_INPUT_INVALID');
const sources = process.argv.slice(2);
if (sources.length > 20) throw new Error('LOCAL_CONVERSION_PROBE_INPUT_INVALID');
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-local-probe-'));
try {
  const server = path.join(scope, 'server');
  writeStandaloneRuntime(path.join(repo, 'plugins', 'data-secure', 'server'), server, target);
  writeConversionRuntime(repo, path.join(server, 'standalone', 'conversion-runtime'), target);
  const { inspectSourceFormatFromFd } = require(path.join(server, 'gateway', 'source-format-inspector.js'));
  const { convertBuffer } = require(path.join(server, 'standalone', 'conversion-worker.js'));
  for (const [index, source] of sources.entries()) {
    const extension = path.extname(source).toLowerCase();
    const fd = fs.openSync(source, 'r');
    let verdict;
    try { verdict = inspectSourceFormatFromFd(fd, fs.fstatSync(fd), extension,
      { processingMode: 'markdown-only', productChannel: 'standalone' }); }
    finally { fs.closeSync(fd); }
    if (verdict.verdict !== 'candidate') {
      process.stdout.write(JSON.stringify({ index: index + 1, admitted: false, code: verdict.code }) + '\n');
      continue;
    }
    try {
      const result = await convertBuffer(fs.readFileSync(source), extension,
        ['.pdf', '.pptx'].includes(extension) ? { passiveObjects: true } : {});
      process.stdout.write(JSON.stringify({ index: index + 1, admitted: true,
        markdown_chars: result.markdown.length, coverage: result.coverage }) + '\n');
    } catch (cause) {
      process.stdout.write(JSON.stringify({ index: index + 1, admitted: true,
        error_code: cause?.code || 'UNKNOWN' }) + '\n');
    }
  }
} finally {
  removePackageSmokeScope(repo, scope);
}
