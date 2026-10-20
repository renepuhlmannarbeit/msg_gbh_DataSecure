// Actual HTML textareas + production renderer/helper, synthetic private IPC.
// Headless Chromium only: not native Windows/macOS WebView or human UAT.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright-core');
const frontend = path.resolve(import.meta.dirname, '../../apps/datasecure-standalone/frontend');
const html = fs.readFileSync(path.join(frontend, 'workspace.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, '').replace(/<link\b[^>]*>/gu, '');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless: true });
let passed = 0;
async function scope(markdown, { mode = 'markdown-and-anonymize', original = markdown, entity = null, entityPages = null } = {}, action) {
  const context = await browser.newContext();
  let backend = markdown; const calls = [], errors = [], batchId = 'a'.repeat(64), control = { failReload: false, failPage: null };
  const pages = entityPages || (entity ? [[entity]] : []);
  const row = { document_id: '1'.repeat(32), name: 'synthetic.txt', revision: 0, output_sha256: sha(markdown),
    chunks: 1, approved: false, text_modified: false, processing_mode: mode,
    entity_review_available: pages.length > 0, entity_count: pages.flat().length, run_entity_review_available: true };
  try {
    await context.route('**/*', route => route.abort());
    const page = await context.newPage(); page.on('pageerror', error => errors.push(String(error)));
    await page.exposeFunction('syntheticDocumentInvoke', (command, args) => {
      calls.push({ command, args });
      if (command === 'get_document_reviews') { if (control.failReload) throw Error('STANDALONE_BUSY'); return { documents: [{ ...row }], unavailable: [], processing_mode: mode,
        processing_complete: true, result_publication: { state: row.revision ? 'pending' : 'initial', generation_id: null,
          count: 1, current_revision: row.revision }, local_ui_only: true, external_disclosure: false }; }
      if (command === 'get_document_review_chunk') return { ...row, chunk_index: 0, original_text: original,
        markdown: backend, local_ui_only: true, external_disclosure: false };
      if (command === 'get_document_entities') { if (control.failPage === args.page) throw Error('STANDALONE_BUSY'); return { ok: true, ...row, page: args.page, pages: pages.length, entities: pages[args.page],
        local_ui_only: true, external_disclosure: false }; }
      if (command === 'decide_document_review') {
        const decision = args.decision; assert.equal(decision.output_sha256, sha(backend)); assert.equal(decision.revision, row.revision);
        if (decision.action === 'entities') { assert.equal(decision.ranges.length, 0); assert.ok(decision.entity_decisions.length > 0 && decision.entity_decisions.length <= 500); }
        else {
          assert.equal(decision.ranges.length, 1); const range = decision.ranges[0];
          backend = backend.slice(0, range.start) + (decision.action === 'correct' ? range.replacement : '[MANUAL_REDACTION]') + backend.slice(range.end);
        }
        Object.assign(row, { revision: row.revision + 1, output_sha256: sha(backend), text_modified: true });
        return { ok: true, ...row, local_ui_only: true, external_disclosure: false };
      }
      if (command === 'publish_result_documents') return { ok: true, batch_id: batchId, local_ui_only: true, external_disclosure: false,
        result_publication: { state: 'current', generation_id: 'e'.repeat(32), count: 1, current_revision: row.revision } };
      if (command === 'close_document_reviews') return { ok: true };
      throw Error('UNEXPECTED_SYNTHETIC_COMMAND');
    });
    await page.setContent(html);
    for (const name of ['design-tokens.css', 'workspace.css']) await page.addStyleTag({ path: path.join(frontend, name) });
    await page.evaluate(() => {
      // This isolated renderer fixture does not load workspace navigation.
      for (let node = document.getElementById('documents-view'); node; node = node.parentElement) node.hidden = false;
      window.__TAURI__ = { core: { invoke: (...args) => window.syntheticDocumentInvoke(...args) } };
    });
    for (const name of ['workflow-presentation.js', 'text-positions.js', 'document-review.js'])
      await page.addScriptTag({ path: path.join(frontend, name) });
    await page.evaluate(id => window.__DATASECURE_DOCUMENTS__.open(id), batchId);
    await page.locator('#documents-list button').click();
    await page.waitForFunction(() => document.getElementById('document-original').value.length > 0 &&
      document.getElementById('documents-view').getAttribute('aria-busy') === 'false');
    await action({ page, calls, control, backend: () => backend });
    assert.deepEqual(errors, []);
    passed++;
  } finally { await context.close(); }
}
try {
  for (const mode of ['markdown-and-anonymize', 'markdown-only'])
    for (const raw of ['aa\r\nxyz\r\nend', 'aa\rxyz\nend', 'aa\nxyz\nend', '😀\r\na\rb\nxyz\r\nend'])
      await scope(raw, { mode }, async ({ page, calls, backend }) => {
        assert.equal(await page.locator('#document-markdown').inputValue(), raw.replace(/\r\n?/gu, '\n'));
        if (mode === 'markdown-only') {
          assert.equal(await page.locator('#document-save-correction').isDisabled(), true, 'loading is not a user edit');
          const value = await page.locator('#document-markdown').inputValue();
          await page.locator('#document-markdown').fill(value.replace('xyz', 'CHANGED'));
          await page.locator('#document-save-correction').click();
        } else {
          await page.locator('#document-markdown').evaluate(node => { const at = node.value.indexOf('xyz'); node.focus(); node.setSelectionRange(at, at + 3); });
          await page.waitForFunction(() => document.getElementById('document-mask-preview').value === 'xyz');
          assert.equal(calls.some(call => call.command === 'decide_document_review'), false);
          await page.locator('#document-redact').click();
        }
        await page.waitForFunction(() => document.getElementById('documents-status').textContent.includes('Ergebnisstand bereitgestellt'));
        const decisions = calls.filter(call => call.command === 'decide_document_review'); assert.equal(decisions.length, 1);
        const range = decisions[0].args.decision.ranges[0];
        assert.equal(range.start, raw.indexOf('xyz')); assert.equal(range.end, raw.indexOf('xyz') + 3);
        assert.equal(backend(), raw.replace('xyz', mode === 'markdown-only' ? 'CHANGED' : '[MANUAL_REDACTION]'));
        assert.equal(calls.filter(call => call.command === 'publish_result_documents').length, 1);
        assert.equal(calls.some(call => call.command === 'export_approved_documents'), false);
      });
  const original = '😀\r\noriginal\rNAME\nend', markdown = '😀\r\noutput\r\n[PERSON_001]\rend';
  await scope(markdown, { original, entity: { entity_id: 'entity_000001', original: 'NAME', replacement: '[PERSON_001]', disabled: false,
    kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: markdown.indexOf('[PERSON_001]'),
    output_end: markdown.indexOf('[PERSON_001]') + 12, source_start: original.indexOf('NAME'), source_end: original.indexOf('NAME') + 4 } },
  async ({ page, calls }) => {
    await page.locator('#document-extra-actions > summary').click(); await page.locator('#entities-list button').click();
    const selected = await page.evaluate(() => ['document-original', 'document-markdown'].map(id => {
      const node = document.getElementById(id); return node.value.slice(node.selectionStart, node.selectionEnd);
    }));
    assert.deepEqual(selected, ['NAME', '[PERSON_001]']); assert.equal(calls.some(call => call.command === 'decide_document_review'), false);
  });
  await scope('aa\r\n😀end', {}, async ({ page, calls, backend }) => {
    await page.locator('#document-markdown').evaluate(node => { node.focus(); const at = node.value.indexOf('😀'); node.setSelectionRange(at + 1, at + 2); });
    assert.equal(await page.locator('#document-redact').isDisabled(), true);
    assert.equal(calls.some(call => call.command === 'decide_document_review'), false);
    assert.match(await page.locator('#document-mask-reason').innerText(), /vollständige Zeichen markieren/u);
    assert.equal(backend(), 'aa\r\n😀end');
  });

  await scope('aa\r\nxyz\r\nend', {}, async ({ page, calls, backend }) => {
    const right = page.locator('#document-markdown'), left = page.locator('#document-original');
    const point = await right.evaluate(node => {
      const style = getComputedStyle(node), canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = style.font;
      return { x: parseFloat(style.paddingLeft) + context.measureText('x').width * 1.5,
        y: parseFloat(style.paddingTop) + (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2) * 1.5 };
    });
    await right.dblclick({ position: point });
    assert.equal(await right.evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd)), 'xyz', 'actual mouse double-click selects the synthetic second-line word');
    await page.waitForFunction(() => document.getElementById('document-mask-preview').value === 'xyz');
    assert.equal(await page.locator('#document-redact').isEnabled(), true);
    await left.click(); await left.press('Control+A');
    assert.equal(await page.locator('#document-redact').isDisabled(), true, 'a left-side selection invalidates the old right range');
    assert.equal(await page.locator('#document-mask-preview').isHidden(), true);
    assert.equal(calls.some(call => call.command === 'decide_document_review'), false);
    // Headless Edge supports keyboard Select All on readonly controls; its
    // caret arrows are inert even in a standalone textarea without our code.
    await right.click(); await right.press('Control+A');
    await page.waitForFunction(() => document.getElementById('document-mask-preview').value === 'aa\nxyz\nend');
    await page.locator('#document-redact').click();
    await page.waitForFunction(() => document.getElementById('documents-status').textContent.includes('Ergebnisstand bereitgestellt'));
    assert.equal(backend(), '[MANUAL_REDACTION]');
    assert.equal(calls.filter(call => call.command === 'decide_document_review').length, 1);
  });
  const entityAt = id => ({ entity_id: `entity_${String(id).padStart(6, '0')}`, original: 'NAME', replacement: '[PERSON_001]',
    disabled: false, kind: 'PERSON', run_eligible: true, count: 1, decision: 'default', output_start: 0, output_end: 12 });
  await scope('[PERSON_001]\r\nend', { entityPages: [[entityAt(1)], [entityAt(2)]] }, async ({ page, calls }) => {
    await page.locator('#document-extra-actions > summary').click();
    assert.equal(await page.locator('#entities-decision').inputValue(), ''); assert.equal(await page.locator('#entities-scope').inputValue(), 'document');
    await page.locator('#entities-list input').check();
    assert.equal(await page.locator('#entities-apply').isDisabled(), true);
    assert.equal(await page.locator('#documents-reload').isDisabled(), true, 'an intentional entity draft cannot be silently replaced');
    await page.locator('#entities-next').click(); await page.waitForFunction(() => document.getElementById('entities-page').textContent === 'Seite 2 von 2');
    await page.locator('#entities-list input').check();
    await page.locator('#entities-previous').click(); await page.waitForFunction(() => document.getElementById('entities-page').textContent === 'Seite 1 von 2');
    assert.equal(await page.locator('#entities-list input').isChecked(), true);
    assert.match(await page.locator('#entities-count').innerText(), /^2 ausgewählt/u);
    assert.equal(calls.some(call => call.command === 'decide_document_review'), false, 'page navigation is read-only');
    await page.locator('#entities-decision').selectOption('person'); await page.locator('#entities-apply').click();
    await page.waitForFunction(() => document.getElementById('documents-status').textContent.includes('Behandlung gespeichert'));
    const decisions = calls.filter(call => call.command === 'decide_document_review'); assert.equal(decisions.length, 1);
    assert.deepEqual(decisions[0].args.decision.entity_decisions.map(value => value.entity_id), ['entity_000001', 'entity_000002']);
    assert.equal(decisions[0].args.decision.scope, undefined);
    assert.equal(calls.some(call => call.command === 'export_approved_documents'), false);
  });
  await scope('[PERSON_001]\r\nend', { entity: entityAt(1) }, async ({ page, calls, control }) => {
    await page.locator('#document-extra-actions > summary').click();
    assert.equal(await page.locator('#entities-pagination').isHidden(), true);
    await page.locator('#entities-list input').check(); await page.locator('#entities-decision').selectOption('person');
    control.failReload = true;
    assert.equal(await page.locator('#documents-reload').isDisabled(), true);
    await page.locator('#document-discard-draft').click(); await page.locator('#documents-reload').click();
    await page.waitForFunction(() => document.getElementById('documents-status').textContent.includes('konnte nicht abgefragt werden'));
    assert.equal(await page.locator('#document-redact').isDisabled(), true); assert.equal(await page.locator('#entities-apply').isDisabled(), true);
    assert.match(await page.locator('#entities-reason').innerText(), /nicht mehr bestätigt/u);
    assert.equal(calls.some(call => call.command === 'decide_document_review'), false);
  });
  console.log(`HEADLESS HTML TEXT POSITIONS PASS: ${passed} cases; actual textarea + renderer/helper; synthetic IPC; no native WebView/UAT claim`);
} finally { await browser.close(); }
