// Real app assets + synthetic IPC: browser UX evidence, not native acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startReviewPreview, syntheticDraft } from '../../scripts/lib/standalone-review-preview.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { buildContactBatch } = require('../../plugins/data-secure/server/gateway/ocr-contact-batch');
const { encodePng } = require('../../plugins/data-secure/server/images/png');
const contacts = buildContactBatch(['one.png', 'two.png'].map((source_label, index) => ({ source_label,
  input: { original_text: 'E-Mail: same@wrong.invalid', source_type: 'png', contacts: [{ start: 8, end: 26, page: 1, line: 1, kind: 'email',
    image: { schema: 'datasecure-ocr-contact-image/1', source_width: 4, source_height: 3, x: 0, y: 0, width: 4, height: 3,
      png_base64: encodePng({ width: 4, height: 3, rgba: Buffer.alloc(48, index ? 180 : 255) }).toString('base64') } }] } }))).draft;
const evidence = fs.mkdtempSync(path.resolve('dist/engineering-review-bulk-browser-'));
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless: true });
async function scenario(draft, work, { embedded = false, waiting = false } = {}) {
  const preview = await startReviewPreview({ draft });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, colorScheme: 'light' });
  try {
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    if (waiting) await context.route('**/preview-ocr.js', route => route.fulfill({ contentType: 'text/javascript', body: `(() => {
      const data = ${JSON.stringify(Buffer.from(JSON.stringify(draft)).toString('base64'))};
      window.previewStatusReads = 0; window.previewReady = false; window.previewHoldStatus = false;
      window.previewSubmissions = [];
      const snapshot = () => window.previewReady ? { ready: true, review_id: 'a'.repeat(32), chunk_count: 1 }
        : { ready: false, phase: 'preparing', continuation_available: false };
      window.__TAURI__ = { event: { listen: async () => () => {} }, core: { invoke: async (command, args) => {
        if (command === 'get_review_session') {
          window.previewStatusReads++;
          if (window.previewHoldStatus) return new Promise(resolve => { window.previewReleaseStatus = () => resolve(snapshot()); });
          return snapshot();
        }
        if (command === 'get_review_chunk') return { review_id: 'a'.repeat(32), index: 0, data };
        if (command === 'submit_review') { window.previewSubmissions.push(args.answer); window.previewReady = false; return { accepted: true }; }
        if (command === 'close_review_window') return { ok: true };
        throw Error('Unsupported waiting-only synthetic command');
      } } };
    })();` }));
    // Test instrumentation must not relax the app's production-style CSP.
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${preview.url}/review.html${embedded ? '?embedded=1' : ''}`);
    if (waiting) await page.waitForFunction(() => window.previewStatusReads >= 1);
    else await page.locator('#review').waitFor({ state: 'visible' });
    await work(page); assert.deepEqual(errors, []);
  } finally { await context.close(); await preview.close(); }
}
const apply = async (page, value) => { await page.locator('#bulk-treatment').selectOption(value); await page.locator('#bulk-apply').click(); };
try {
  for (const embedded of [false, true]) await scenario(syntheticDraft('entities'), async page => {
    const retry = page.locator('#retry');
    await retry.focus();
    const initialReads = await page.evaluate(() => {
      window.previewMutations = [];
      window.previewObserver = new MutationObserver(records => window.previewMutations.push(...records.map(record => ({
        id: record.target.id || record.target.parentElement?.id || '', type: record.type, attribute: record.attributeName
      }))));
      window.previewObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      return window.previewStatusReads;
    });
    await page.waitForFunction(reads => window.previewStatusReads >= reads + 3, initialReads, { timeout: 7000 });
    assert.deepEqual(await page.evaluate(() => window.previewMutations), [], 'three real 1200ms background polls leave actual DOM/live regions unchanged');
    assert.equal(await retry.isEnabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'retry');
    await page.evaluate(() => { window.previewHoldStatus = true; window.previewMutations = []; });
    await retry.click();
    assert.equal(await retry.isDisabled(), true, 'an explicit status read remains visibly locked');
    await page.waitForFunction(() => typeof window.previewReleaseStatus === 'function');
    await page.evaluate(() => { window.previewHoldStatus = false; window.previewReleaseStatus(); });
    await page.waitForFunction(() => !document.getElementById('retry').disabled);
    assert.deepEqual(await page.evaluate(() => window.previewMutations), [
      { id: 'retry', type: 'attributes', attribute: 'disabled' },
      { id: 'retry', type: 'attributes', attribute: 'disabled' }
    ]);
    await page.evaluate(() => { window.previewReady = true; window.previewMutations = []; });
    await page.locator('#review').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#matrix-body tr').count(), 1);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'matrix-title');
    assert.ok(await page.evaluate(() => window.previewMutations.some(record => record.id === 'matrix-body' && record.type === 'childList')));
    await page.locator('#select-visible').check(); await apply(page, 'keep'); await page.locator('#release').click();
    await page.locator('#waiting').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#matrix-body tr').count(), 0);
    assert.equal(await page.locator('#source-context').textContent(), '');
    assert.equal(await page.locator('#contact-image').getAttribute('src'), '');
    assert.equal(await page.evaluate(() => window.previewSubmissions.length), 1, 'one explicit handoff, no synthetic repeat submission');
    await page.evaluate(() => window.previewObserver.disconnect());
  }, { embedded, waiting: true });
  await scenario(syntheticDraft('entities'), async page => {
    assert.equal(await page.locator('#matrix-body tr').count(), 1);
    assert.equal(await page.locator('#matrix-body input:checked').count(), 0);
    assert.equal(await page.locator('#matrix-body select, #redact, #keep, #contact-value').count(), 0);
    await page.locator('#occurrence').selectOption({ index: 1 });
    assert.match(await page.locator('#document-position').textContent(), /Demo-Zwei.docx/u);
    await page.locator('#select-visible').check(); await page.locator('#bulk-treatment').selectOption('redact_organization');
    assert.equal(await page.locator('#release').isEnabled(), false, 'Mode is not a decision');
    await page.locator('#bulk-apply').click();
    assert.equal(await page.locator('#matrix-body tr').count(), 0, 'Staged rows leave the open work queue');
    assert.equal(await page.locator('#release').isEnabled(), true);
    assert.deepEqual(await page.evaluate(() => window.previewSubmissions), [], 'Apply stages only; it must not submit');
    await page.locator('#matrix-filter').selectOption('done');
    assert.match(await page.locator('#output-context').textContent(), /\[UNTERNEHMEN_…\]/u);
    assert.equal(await page.locator('#matrix-body tr').count(), 1, 'Staged rows remain available for deliberate comparison');
    await page.locator('.matrix-extra > summary').click();
    await page.locator('#undo').click(); assert.equal(await page.locator('#release').isEnabled(), false);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(item => item.id), []);
  });
  await scenario(contacts, async page => {
    const rows = page.locator('#matrix-body tr'), input = index => rows.nth(index).locator('input[type=text]');
    assert.match(await page.locator('#matrix-guide').textContent(), /keine 2 Konvertierungsfehler/u);
    assert.equal(await page.locator('#matrix-document option').count(), 3);
    for (const [index, filename] of ['one.png', 'two.png'].entries()) {
      for (const control of [rows.nth(index).locator('input[type=checkbox]'),
        rows.nth(index).locator('button[data-action="details"]'), input(index)]) {
        const label = await control.getAttribute('aria-label');
        assert.match(label, new RegExp(`${filename.replace('.', '\\.')}.*Dokument ${index + 1} von 2, Fundstelle ${index + 1} von 2`, 'u'));
      }
    }
    await page.setViewportSize({ width: 390, height: 850 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
      console.error('390px overflow', await page.evaluate(() => [...document.querySelectorAll('*')]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 12).map(element => ({ tag: element.tagName, id: element.id, className: element.className,
          right: Math.round(element.getBoundingClientRect().right) }))));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'OCR document filter reflows at 390px');
    await page.setViewportSize({ width: 1500, height: 1000 });
    const contactAudit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    assert.deepEqual(contactAudit.violations.map(item => item.id), [], 'Contact review retains labelled, accessible controls');
    await page.locator('#matrix-document').selectOption('1');
    assert.equal(await rows.count(), 1);
    await page.locator('#select-visible').check();
    await page.locator('#matrix-document').selectOption('2');
    assert.equal(await rows.count(), 1);
    assert.equal(await page.locator('#select-visible').isChecked(), false, 'Hidden document selection is cleared');
    await page.locator('#matrix-document').selectOption('all');
    await input(0).fill('first@new.invalid'); await input(1).fill('not an email');
    await page.locator('#select-visible').check(); await apply(page, 'correct_contact');
    assert.match(await page.locator('#summary').textContent(), /^0 von/u);
    assert.match(await page.locator('#matrix-message').textContent(), /two.png/u);
    await apply(page, 'confirm_contact');
    assert.match(await page.locator('#matrix-message').textContent(), /geänderte Eingabe/u);
    assert.equal(await input(0).inputValue(), 'first@new.invalid');
    await input(1).fill('second@new.invalid'); await apply(page, 'correct_contact');
    assert.equal(await page.locator('#release').isEnabled(), true);
    await page.locator('#matrix-filter').selectOption('done'); await page.locator('#select-visible').check();
    await input(1).fill('changed@new.invalid'); assert.equal(await page.locator('#release').isEnabled(), false);
    assert.equal(await page.locator('#matrix-filter').inputValue(), 'all');
    assert.equal(await page.locator('#select-visible').isChecked(), false);
    assert.equal(await input(1).inputValue(), 'changed@new.invalid');
    await page.locator('.matrix-extra > summary').click();
    await page.locator('#undo').click();
    assert.equal(await input(1).inputValue(), 'second@new.invalid', 'Undo restores the pending inputs before the whole Apply');
    assert.equal(await page.locator('#release').isEnabled(), false);
    assert.match(await page.locator('#output-context').textContent(), /first@new.invalid/u);
    await page.locator('#finding-next').click(); assert.match(await page.locator('#document-position').textContent(), /two.png/u);
    await page.locator('#finding-prev').click(); assert.match(await page.locator('#document-position').textContent(), /one.png/u);
    await page.locator('#select-visible').check(); await apply(page, 'correct_contact');
    await page.locator('#release').click(); await page.locator('#waiting').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.previewSubmissions[0].decisions.map(item => item.replacement)), ['first@new.invalid', 'second@new.invalid']);
    assert.equal(await page.locator('#matrix-body tr').count(), 0);
    assert.equal(await page.locator('#contact-image').getAttribute('src'), '');
    assert.equal(await page.locator('#document-position').textContent(), '');
  });
  await scenario(contacts, async page => {
    const corrections = page.locator('#matrix-body input[data-action="correction"]');
    const proposal = page.locator('#matrix-body button[data-action="copy-correction"]').first();
    assert.equal(await proposal.isVisible(), false, 'a correction is required before proposing it elsewhere');
    await corrections.first().fill('same@correct.invalid');
    assert.equal(await proposal.isVisible(), true);
    await page.setViewportSize({ width: 390, height: 850 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'the explicit proposal does not create mobile horizontal overflow');
    await proposal.click();
    assert.equal(await corrections.nth(1).inputValue(), 'same@correct.invalid');
    assert.match(await page.locator('#summary').textContent(), /^0 von/u, 'the copied proposal confirms neither image');
    assert.deepEqual(await page.evaluate(() => window.previewSubmissions), [], 'the proposal is never submitted');
    assert.match(await page.locator('#matrix-message').textContent(), /Original einzeln vergleichen/u);
    await page.locator('.matrix-extra > summary').click();
    await page.locator('#undo').click();
    assert.equal(await corrections.nth(1).inputValue(), '', 'one Undo restores only the copied proposal');
    assert.equal(await corrections.first().inputValue(), 'same@correct.invalid');
  });
  await scenario(syntheticDraft(), async page => {
    assert.equal(await page.locator('#matrix-body tr').count(), 50);
    await page.locator('#matrix-body input[type=checkbox]').first().check();
    assert.equal(await page.locator('#select-visible').evaluate(element => element.indeterminate), true);
    await page.locator('#matrix-next').click();
    assert.equal(await page.locator('#matrix-body tr').count(), 14);
    assert.equal(await page.locator('#bulk-apply').isEnabled(), false);
    await page.locator('#matrix-type').selectOption('email');
    assert.equal(await page.locator('#matrix-body tr').count(), 32);
    await page.locator('#matrix-type').selectOption('all');
    for (const width of [1920, 1500, 1200, 900, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Reflow at ${width}px`);
    }
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.screenshot({ path: path.join(evidence, 'review-bulk.png'), fullPage: true });
  });
  await scenario(syntheticDraft(), async page => {
    await page.setViewportSize({ width: 1366, height: 580 });
    const pinned = page.locator('.matrix-actions-pinned');
    assert.equal(await pinned.evaluate(element => getComputedStyle(element).position), 'static',
      'short embedded views reserve no competing sticky action overlay');
    await page.evaluate(() => window.scrollTo(0, 220));
    for (const selector of ['.table-scroll', '.matrix-detail', 'pre'])
      assert.equal(await page.locator(selector).first().evaluate(element =>
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)), false,
      'the embedded document owns vertical scrolling, not ' + selector);
    assert.ok(await page.locator('#select-filtered').isVisible());
    assert.ok(await page.locator('#bulk-apply').isVisible());
    await page.locator('#select-filtered').focus();
    assert.ok(await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight; }), 'Keyboard focus brings the action into view');
    await page.screenshot({ path: path.join(evidence, 'review-embedded-580px.png') });
    await page.locator('#select-visible').check();
    await apply(page, 'confirm_contact');
    assert.ok(await page.evaluate(() => { const focused = document.activeElement.getBoundingClientRect();
      return document.activeElement.id === 'exact-text' && focused.top >= 0 && focused.bottom <= innerHeight; }),
    'After Apply, the next comparison is focused and visible without an action overlay');
    await page.setViewportSize({ width: 683, height: 580 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Embedded review reflows at 200%-equivalent width');
  }, { embedded: true });
  console.log('REVIEW BULK BROWSER PASS: actual HTML/JS/CSS, stable waiting DOM/live regions/focus across real 1200ms polls, explicit read locks and private group transitions, single explicit Apply, no duplicate editors/actions, bounded OCR correction proposals without implicit decisions, different per-row corrections, atomic validation, Undo, grouped contexts, privacy clearing, axe, pagination and 390–1920px reflow; synthetic IPC, no native claim; evidence=' + evidence);
} finally { await browser.close(); }
