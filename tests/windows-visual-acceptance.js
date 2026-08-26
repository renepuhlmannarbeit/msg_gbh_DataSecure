'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { zipStore } = require('./lib/zip');

if (process.platform !== 'win32') {
  console.log('Windows visual acceptance: skipped (Windows only)');
  process.exit(0);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-windows-visual-'));
process.env.EU_PRIVACY_ROOT = root;
process.env.LOCALAPPDATA = path.join(root, 'localapp');

const imagePath = path.join(root, 'synthetic-ocr.png');
const escaped = imagePath.replace(/'/g, "''");
const drawScript = [
  "$ErrorActionPreference='Stop'",
  'Add-Type -AssemblyName System.Drawing',
  '$bmp=New-Object System.Drawing.Bitmap 1500,260',
  '$g=[System.Drawing.Graphics]::FromImage($bmp)',
  "$g.Clear([System.Drawing.Color]::White)",
  "$font=New-Object System.Drawing.Font 'Arial',42",
  "$g.DrawString('Kunde: Max Mustermann  max@example.de',$font,[System.Drawing.Brushes]::Black,20,70)",
  `$bmp.Save('${escaped}',[System.Drawing.Imaging.ImageFormat]::Png)`,
  '$font.Dispose()',
  '$g.Dispose()',
  '$bmp.Dispose()'
].join('; ');

async function main() {
  try {
    const generated = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', drawScript],
      { encoding: 'utf8', windowsHide: true }
    );
    assert.strictEqual(generated.status, 0, generated.stderr || 'synthetic image generation failed');

    const inputDir = path.join(root, 'Input');
    fs.mkdirSync(inputDir, { recursive: true });
    const docx = zipStore([
      ['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Synthetischer OCR-Test</w:t></w:r></w:p></w:body></w:document>'],
      ['word/media/image1.png', fs.readFileSync(imagePath)]
    ]);
    const source = path.join(inputDir, 'synthetic-ocr.docx');
    fs.writeFileSync(source, docx);

    const { ocrPngDetailed, rasterizeToPng, visualBridgeStatus, VisualBridgeError } =
      require('../plugins/data-secure/server/windows-visual');
    const rawOcr = await ocrPngDetailed(fs.readFileSync(imagePath), 'de-DE');
    assert.match(rawOcr.text, /Max Mustermann/);
    assert.match(rawOcr.text, /max@example\.de/);

    const { anonymizeSelectedSource } = require('../plugins/data-secure/server/gateway/orchestrator');
    const result = await anonymizeSelectedSource(source, 'customer');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.visual_assets.included, 0, 'visual assets must never be released automatically');
    assert.strictEqual(result.visual_assets.review_required, 1, 'visual asset must remain local for review');
    assert.strictEqual(result.visual_assets.redactions, 0, 'withheld pixels must not require a release redaction');

    const outputDir = path.join(root, 'Output', result.package_id);
    const manifest = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
    const markdown = fs.readFileSync(path.join(outputDir, manifest.document), 'utf8');
    assert.ok(!markdown.includes('Max Mustermann'));
    assert.ok(!markdown.includes('max@example.de'));
    assert.ok(markdown.includes('[PERSON_001]'));
    assert.ok(markdown.includes('[EMAIL_REDACTED]'));

    assert.deepStrictEqual(visualBridgeStatus(), {
      available: true, mode: 'windows_job_object', reason: 'ok'
    });
    await assert.rejects(
      rasterizeToPng(Buffer.from('not-an-emf', 'ascii'), 'emf'),
      (error) => error instanceof VisualBridgeError
    );
    console.log('Windows visual acceptance: PASS (Job Object, real OCR, local-only pixels, malformed EMF refusal)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
