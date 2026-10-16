// Actual v2 HTML/CSS/JS with synthetic IPC. Headless only; no native/UAT claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startReviewPreview } from '../../scripts/lib/standalone-review-preview.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : 'chrome', headless: true });
const preview = await startReviewPreview({ workspace: true });
const evidence = process.env.DATASECURE_UI_EVIDENCE_DIR
  ? path.resolve(process.env.DATASECURE_UI_EVIDENCE_DIR) : fs.mkdtempSync(path.resolve('dist/workflow-usability-design-'));
fs.mkdirSync(evidence, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
try {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(preview.url + '/workspace.html');
  await page.locator('#mode-markdown').check();
  await page.locator('#text-ocr-options').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#text-ocr').isChecked(), false);
  assert.equal(await page.locator('#ocr-review').isEnabled(), false);
  await page.locator('#text-ocr').check();
  assert.equal(await page.locator('#ocr-review').isEnabled(), true);
  await page.locator('#ocr-review').check();
  await page.locator('#text-ocr').uncheck();
  assert.equal(await page.locator('#ocr-review').isEnabled(), false);
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'raw setup reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'raw setup axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#text-ocr').check();
  await page.screenshot({ path: path.join(evidence, 'markdown-ocr-setup.png'), fullPage: true });
  await page.locator('#mode-anonymize').check();
  assert.equal(await page.locator('#text-ocr-options').isVisible(), true,
    'the shared OCR choice remains available for the new anonymization purpose');
  assert.equal(await page.locator('#text-ocr').isChecked(), true,
    'changing purpose does not silently discard the visible OCR choice');
  assert.equal(await page.locator('#ocr-review').isEnabled(), false,
    'the raw-only optional contact review is not a second anonymization checkbox');
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'anon setup reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'anon setup axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(evidence, 'anonymization-ocr-setup.png'), fullPage: true });
  for (const demo of ['completion-raw', 'completion-mixed']) {
    await page.goto(preview.url + '/workspace.html?demo=' + demo); await page.locator('#nav-history').click();
    const prefix = '#history-' + 'b'.repeat(64);
    if (demo === 'completion-raw') {
      await page.locator(prefix + '-results.primary').waitFor();
      assert.ok((await page.locator('#history-list').innerText()).includes('Lauf abgeschlossen mit Hinweisen'));
      await page.locator(prefix + '-problems').click();
      assert.equal(await page.locator(prefix + '-files .problem-card').count(), 0);
    } else { await page.locator(prefix + '-problems-main.primary').click();
      assert.equal(await page.locator(prefix + '-files .problem-card').count(), 1); }
    assert.equal(await page.locator(prefix + '-files .notice-card').count(), demo === 'completion-raw' ? 52 : 51);
    const content = page.locator(prefix + '-files details'); await content.locator('summary').click();
    assert.equal(await content.locator('.notice-card').count(), 35);
    for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), demo + ' reflow ' + width);
      const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
      assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], demo + ' axe ' + width);
    }
    await content.locator('summary').click(); await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(evidence, demo + '.png'), fullPage: true });
  }
  for (const mode of ['documents-raw', 'documents', 'documents-raw-notices']) {
    const raw = mode.startsWith('documents-raw');
    await page.goto(preview.url + '/workspace.html?demo=' + mode);
    await page.locator('#nav-history').click();
    const rowPrefix = '#history-' + 'b'.repeat(64);
    if (raw) await page.locator(rowPrefix + '-more').click();
    await page.locator(rowPrefix + '-documents').click();
    if (mode === 'documents-raw-notices') {
      await page.locator('#documents-loading').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#documents-export').isEnabled(), false);
    }
    await page.locator('#documents-list .document-row').first().waitFor();
    if (raw) {
      assert.ok((await page.locator('#documents-heading').innerText()).includes('freiwillig'));
      assert.ok((await page.locator('#documents-purpose').innerText()).includes('Häkchen wählen nur Dateien für eine zusätzliche Kopie'));
      assert.equal(await page.locator('#document-markdown').inputValue(), '');
      await page.locator('#documents-list .document-row input').first().check();
      assert.equal(await page.locator('#document-markdown').inputValue(), '', 'copy selection never opens a comparison');
      await page.locator('#documents-list .document-row input').first().uncheck();
    }
    assert.equal(await page.locator('#nav-history').getAttribute('aria-controls'), 'documents-view');
    await page.locator('#documents-list button').first().click();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => [...document.fonts].some(font => font.family === 'Inter' && font.status === 'loaded')), true);
    await page.waitForFunction(() => document.querySelector('#document-markdown').value.length > 0);
    assert.ok(await page.locator('#document-markdown').evaluate(node => getComputedStyle(node).fontFamily.includes('monospace')));
    assert.ok(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily.includes('Inter')));
    assert.equal(await page.locator('#documents-main-guide').isVisible(), !raw);
    assert.equal(await page.locator('#documents-approval-extras').isVisible(), !raw);
    assert.equal(await page.locator('#documents-revoke').isVisible(), false, 'revocation starts collapsed');
    assert.equal(await page.locator('#document-extra-actions').isVisible(), !raw);
    assert.equal(await page.locator('#document-redact').isVisible(), false, 'optional text mutations start collapsed');
    if (!raw) {
      await page.locator('#document-extra-actions > summary').click();
      assert.equal(await page.locator('#document-redact').isVisible(), true);
      await page.locator('#document-markdown').evaluate(node => node.setSelectionRange(0, 4));
      await page.locator('#document-redact').click();
      assert.equal(await page.locator('#document-change-confirm').isVisible(), true);
      assert.ok((await page.locator('#document-change-confirm-text').innerText()).includes('Noch nichts geändert'));
      await page.locator('#document-change-cancel').click();
      assert.equal(await page.locator('#document-change-confirm').isVisible(), false);
      await page.locator('#document-extra-actions > summary').click();
    }
    assert.equal(await page.locator('#document-markdown').getAttribute('readonly') !== null, !raw);
    assert.equal(await page.locator('#documents-approve').isVisible(), !raw);
    if (mode === 'documents-raw-notices') {
      const notices = page.locator('#documents-unavailable');
      assert.equal(await notices.locator('.file-notice-group.error').count(), 0);
      assert.equal(await notices.locator('.file-notice').count(), 2);
      assert.equal(await notices.locator('.file-notice-group').getAttribute('open'), null);
      await notices.locator('.file-notice-group > summary').click();
      await notices.locator('.file-notice > summary').first().click();
      assert.ok((await notices.innerText()).includes('Kein technischer Konvertierungsfehler'));
    }
    for (const [width, height] of [[1280,900], [900,700], [720,560], [390,700]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), mode + ' reflow ' + width);
      const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
      assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], mode + ' axe ' + width);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#documents-all').check();
    if (!raw) { await page.locator('#documents-approve').click();
      await page.locator('#documents-approve-confirm').waitFor({ state: 'visible' });
      assert.match(await page.locator('#documents-approve-confirm-text').innerText(), /2 von 3.*nicht.*geöffnet/u);
      await page.setViewportSize({ width: 390, height: 700 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'approval confirmation reflow');
      const confirmationAudit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
      assert.deepEqual(confirmationAudit.violations.map(row => row.id), [], 'approval confirmation axe');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('#documents-approve-proceed').click();
      await page.waitForFunction(() => document.querySelector('#documents-selected').textContent.includes('3 von 3 freigegeben')); }
    await page.locator('#documents-export').click(); await page.locator('#document-export-dialog').waitFor({ state: 'visible' });
    const names = await page.locator('#document-export-files li').allTextContents();
    assert.deepEqual(names, raw ? ['Lebenslauf-Erika-Linden.md','Kontaktliste.md','Ergänzungen.md'] : ['Dokument_01.md','Dokument_02.md','Dokument_03.md']);
    for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.locator('#document-export-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
      await page.locator('#document-export-close').focus();
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#document-export-close').evaluate(node => getComputedStyle(node).outlineStyle !== 'none'), true);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(evidence, mode + '.png'), fullPage: true });
    await page.locator('#document-export-close').click();
    assert.equal(await page.locator('#document-export-dialog').isVisible(), false);
    if (raw) {
      await page.locator('#documents-export').click(); await page.locator('#document-export-confirm').click();
      await page.waitForFunction(() => document.querySelector('#document-export-title').textContent === 'Markdown-Kopie gespeichert');
      assert.ok((await page.locator('#documents-selected').innerText()).includes('Markdown-Dateien verfügbar'));
    }
  }
  await page.goto(preview.url + '/workspace.html?demo=documents-raw-filter');
  await page.locator('#nav-history').click();
  const filteredRun = '#history-' + 'b'.repeat(64);
  await page.locator(filteredRun + '-more').click(); await page.locator(filteredRun + '-documents').click();
  await page.locator('#documents-filter-bar').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#documents-filter').inputValue(), 'notices');
  assert.equal(await page.locator('#documents-list .document-row').count(), 2);
  assert.ok((await page.locator('#documents-filter option').first().innerText()).includes('Mit Hinweisen (2)'));
  await page.locator('#documents-all').check();
  await page.locator('#documents-export').click();
  assert.deepEqual(await page.locator('#document-export-files li').allTextContents(),
    ['Lebenslauf-Erika-Linden.md', 'Kontaktliste.md']);
  assert.ok((await page.locator('#document-export-dialog').innerText()).includes('Bereits erzeugte Dateien bleiben unverändert'));
  await page.locator('#document-export-close').click();
  await page.locator('#documents-filter').selectOption('all');
  assert.equal(await page.locator('#documents-list .document-row').count(), 3);
  assert.ok((await page.locator('#documents-selected').innerText()).includes('0 ausgewählt'));
  await page.locator('#documents-filter').selectOption('edited');
  assert.equal(await page.locator('#documents-list .document-row').count(), 0);
  await page.locator('#documents-filter').selectOption('notices');
  await page.locator('#documents-list .document-row button').first().click();
  await page.waitForFunction(() => document.querySelector('#document-markdown').value.length > 0);
  await page.locator('#document-markdown').fill('# Projektleitung\nErika Linden\nE-Mail: korrigiert@example.invalid\n\nLeitung von 42 Projekten.\nSachinhalt und Qualifikationen bleiben erhalten.');
  await page.locator('#document-save-correction').click();
  await page.waitForFunction(() => document.querySelector('#documents-list').textContent.includes('Korrektur gespeichert'));
  await page.waitForFunction(() => document.querySelector('#documents-status').textContent.includes('privater Textstand gespeichert'));
  assert.ok((await page.locator('#documents-status').innerText()).includes('zusätzliche Kopie speichern'));
  await page.locator('#documents-filter').selectOption('edited');
  assert.equal(await page.locator('#documents-list .document-row').count(), 1);
  assert.ok((await page.locator('#documents-list').innerText()).includes('Korrektur gespeichert'));
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'raw filter reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'raw filter axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(evidence, 'documents-raw-filter-edited.png'), fullPage: true });
  await page.goto(preview.url + '/workspace.html?demo=active-completion-raw');
  await page.locator('#mode-markdown').check(); await page.locator('#select-folder').click();
  await page.locator('#start').click(); await page.locator('#job').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#nav-new').getAttribute('aria-selected'), 'true');
  await page.waitForFunction(() => document.querySelector('#job-title').textContent === 'Lauf abgeschlossen mit Hinweisen');
  assert.equal(await page.locator('#nav-new').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#run-guide').isVisible(), false);
  assert.equal(await page.locator('#job-status.success').count(), 1);
  assert.equal(await page.locator('#file-problems').getAttribute('open'), null);
  assert.equal(await page.locator('#job-more').getAttribute('open'), null);
  assert.equal(await page.locator('#job-action-documents').isVisible(), false);
  assert.ok(await page.evaluate(() => document.querySelector('#job-actions').compareDocumentPosition(document.querySelector('#file-problems')) & Node.DOCUMENT_POSITION_FOLLOWING));
  assert.equal(await page.locator('#job-action-results').isVisible(), true);
  await page.locator('#file-problems > summary').click();
  await page.locator('#problem-list .notice-card').first().waitFor({ state: 'visible' });
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'active run reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'active run axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 }); await page.locator('#file-problems > summary').click();
  await page.screenshot({ path: path.join(evidence, 'active-run-completed.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('WORKSPACE DESIGN PASS: actual v2 pages, both purposes, comparisons, raw masking exclusion, approval, authoritative filenames, computed fonts, dialog/focus, axe and 390–1280px reflow; synthetic IPC, headless, not native acceptance');
} finally { await context.close(); await preview.close(); await browser.close(); }
