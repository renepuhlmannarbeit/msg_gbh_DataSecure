import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeOcrResult, LIMITS } from './ocr-contract.mjs';

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(runtimeDir, 'runtime-package.json'));
const { createWorker, OEM } = require('tesseract.js');
async function main() {
  const chunks = [];
  let inputBytes = 0;
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    if (inputBytes > LIMITS.maxInputBytes) process.exit(120);
    chunks.push(chunk);
  }
  if (inputBytes === 0) process.exit(120);
  const width = Number(process.env.DATASECURE_OCR_IMAGE_WIDTH);
  const height = Number(process.env.DATASECURE_OCR_IMAGE_HEIGHT);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) process.exit(120);
  const worker = await createWorker(['deu', 'eng'], OEM.LSTM_ONLY, {
    langPath: path.join(runtimeDir, 'models'),
    cacheMethod: 'none',
    gzip: false,
    logger: () => {}
  });
  try {
    const result = await worker.recognize(Buffer.concat(chunks), {}, { blocks: true });
    const normalized = normalizeOcrResult(result.data, {
      width, height, languages: ['deu', 'eng']
    });
    process.stdout.write(`${JSON.stringify(normalized)}\n`);
  } finally {
    await worker.terminate();
  }
}

await main().catch(() => process.exit(122));
