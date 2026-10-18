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
    } else {
      await page.locator(prefix + '-results.primary').waitFor();
      assert.equal(await page.locator(prefix + '-problems').isVisible(), true);
      await page.locator(prefix + '-problems').click();
      assert.equal(await page.locator('#history-list .history-row').first().getAttribute('data-outcome'), 'partial');
      assert.equal(await page.locator(prefix + '-files .problem-card').count(), 1);
    }
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
    assert.equal(await page.locator('#nav-history').getAttribute('aria-controls'), 'history-view');
    assert.equal(await page.locator('#nav-history').getAttribute('aria-selected'), 'false');
    assert.equal(await page.locator('#nav-details').getAttribute('aria-controls'), 'details-view');
    assert.equal(await page.locator('#nav-details').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#details-run-id').innerText(), 'Lauf-ID: ' + 'b'.repeat(64));
    assert.equal(await page.locator('#documents-view').evaluate(node => node.closest('#details-view') !== null), true);
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
  assert.equal(await page.locator('#nav-details').getAttribute('aria-selected'), 'true');
  await page.waitForFunction(() => document.querySelector('#job-title').textContent === 'Lauf abgeschlossen mit Hinweisen');
  assert.equal(await page.locator('#nav-details').getAttribute('aria-selected'), 'true');
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
  const activeRunId = await page.locator('#details-run-id').innerText();
  await page.locator('#nav-new').click();
  assert.equal(await page.locator('#setup').isVisible(), true);
  assert.equal(await page.locator('#job').isVisible(), false);
  await page.locator('#nav-details').click();
  assert.equal(await page.locator('#job').isVisible(), true);
  assert.equal(await page.locator('#details-run-id').innerText(), activeRunId);
  await page.goto(preview.url + '/workspace.html?demo=documents-fast'); await page.locator('#nav-history').click();
  const fastPrefix = '#history-' + 'b'.repeat(64);
  assert.equal(await page.locator('#run-guide').isVisible(), false, 'history does not select an implicit run guide');
  assert.equal(await page.locator(fastPrefix + '-disclosure').getAttribute('open'), null);
  assert.equal(await page.locator(fastPrefix + '-results').isVisible(), true, 'result folder remains directly reachable');
  await page.locator(fastPrefix + '-disclosure > summary').click();
  assert.match(await page.locator('#history-list .history-row').first().innerText(), /Anonymisierungslauf abgeschlossen – mit Hinweisen/u);
  await page.locator(fastPrefix + '-problems').click();
  const sourceHints = page.locator(fastPrefix + '-files details'); await sourceHints.locator('summary').click();
  assert.equal(await sourceHints.locator('.notice-card').count(), 2);
  assert.match(await sourceHints.innerText(), /Automatisch erkannter Text kann Lesefehler enthalten/u);
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Fastweg history hints reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'Fastweg history hints axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(evidence, 'fastweg-completed-with-ocr-hints.png'), fullPage: true });
  await page.locator('#history-' + 'b'.repeat(64) + '-documents').click();
  await page.waitForFunction(() => document.querySelector('#documents-purpose').textContent.includes('3 automatisch freigegeben'));
  assert.equal(await page.locator('#documents-main-guide').isVisible(), false);
  assert.equal(await page.locator('#run-guide-title').innerText(), 'Schnellweg abgeschlossen · automatisch freigegeben');
  await page.locator('#documents-all').check();
  assert.equal(await page.locator('#documents-approve').isEnabled(), false);
  assert.equal(await page.locator('#documents-export').isEnabled(), true);
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Fastweg reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'Fastweg axe ' + width);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(evidence, 'fastweg-automatic-approval.png'), fullPage: true });
  await page.locator('#documents-export').click();
  await page.locator('#document-export-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#document-export-purpose').innerText(), /automatische Erstfreigabe, keine menschliche Prüfung/u);
  await page.evaluate(() => {
    const original = window.__TAURI__.core.invoke;
    const observed = window.previewExportObservation = { phase: 'copying', staged: 1, request: null, requests: [], finish: null, saves: 0 };
    window.__TAURI__.core.invoke = async (command, args) => {
      if (command === 'export_approved_documents') observed.requests.push(structuredClone(args));
      if (command === 'save_diagnostic_bundle') {
        observed.saves++;
        return { ok: true, saved: true, cancelled: false, partial: true, external_disclosure: false };
      }
      if (command === 'export_approved_documents' && !args.acknowledge) {
        observed.request = args;
        return new Promise(resolve => { observed.finish = async () => resolve(await original(command, args)); });
      }
      if (command === 'get_native_recovery_status') return { phase: 'owned', local_ui_only: true, external_disclosure: false,
        activity: { state: 'active', active: true, action: 'export_approved_documents', phase: 'native', elapsed_ms: 100,
          export_progress: { operation_id: observed.request.operationId, phase: observed.phase,
            staged_count: observed.staged, total_count: observed.request.selection.length } } };
      return original(command, args);
    };
  });
  await page.locator('#document-export-confirm').click();
  await page.waitForFunction(() => document.querySelector('#document-export-result').textContent.includes('1 von 3 Dateien'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'document-export-result');
  assert.equal(await page.locator('#document-export-close').isEnabled(), false);
  assert.notEqual(await page.locator('#document-export-title').innerText(), 'Export abgeschlossen');
  assert.equal(await page.locator('#document-export-diagnostic-save').isVisible(), false, 'support starts in its optional disclosure');
  await page.locator('#document-export-support > summary').click();
  await page.locator('#document-export-diagnostic-save').click();
  assert.match(await page.locator('#document-export-diagnostic-status').innerText(), /lokal gespeichert.*gekennzeichnet/u);
  assert.equal(await page.evaluate(() => window.previewExportObservation.saves), 1);
  assert.equal(await page.locator('#document-export-dialog').isVisible(), true);
  assert.equal(await page.locator('#document-export-close').isEnabled(), false, 'support cannot release the export owner');
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.locator('#document-export-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'observed export reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'observed export axe ' + width);
  }
  await page.screenshot({ path: path.join(evidence, 'native-progress-synthetic-ui.png'), fullPage: true });
  await page.evaluate(() => { window.previewExportObservation.phase = 'verifying'; });
  await page.waitForFunction(() => document.querySelector('#document-export-result').textContent.includes('prüft die kopierten Dateien'));
  await page.evaluate(() => window.previewExportObservation.finish());
  await page.waitForFunction(() => document.querySelector('#document-export-title').textContent === 'Export abgeschlossen');
  assert.equal(await page.locator('#document-export-close').isEnabled(), true);
  assert.equal(await page.locator('#document-export-support').isVisible(), false, 'diagnostics are not a successful-copy completion step');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'document-export-close');
  await page.locator('#document-export-close').click();
  await page.locator('#documents-completion').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#documents-view').isVisible(), true, 'export completion stays on the document page');
  await page.waitForFunction(() => document.activeElement.id === 'documents-completion-history');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'documents-completion-history');
  await page.locator('#documents-completion-details').click();
  await page.locator('#details-receipt').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#documents-view').isVisible(), false);
  assert.equal(await page.locator('#nav-details').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#nav-history').getAttribute('aria-controls'), 'history-view');
  assert.equal(await page.locator('#details-run-id').innerText(), 'Lauf-ID: ' + 'b'.repeat(64));
  assert.match(await page.locator('#details-receipt-text').innerText(), /Empfang bestätigt.*kein weiterer Export nötig/u);
  const exportRequests = await page.evaluate(() => window.previewExportObservation.requests);
  assert.equal(exportRequests.length, 2, 'one copy and one durable acknowledgement');
  assert.equal(exportRequests[0].batchId, 'b'.repeat(64));
  assert.equal(exportRequests[1].acknowledge, true);
  assert.equal(exportRequests[1].operationId, exportRequests[0].operationId);
  assert.deepEqual(exportRequests[1].selection, exportRequests[0].selection);
  await page.screenshot({ path: path.join(evidence, 'r6-confirmed-copy-same-run-overview.png'), fullPage: true });

  // Real DOM navigation through the actual renderer close transaction. Its
  // native response is delayed so a second tab click shares the same owner.
  await page.goto(preview.url + '/workspace.html?demo=documents');
  await page.locator('#nav-history').click();
  await page.locator('#history-' + 'b'.repeat(64) + '-documents').click();
  await page.locator('#documents-list .document-row').first().waitFor();
  await page.evaluate(() => {
    const original = window.__TAURI__.core.invoke;
    window.previewNavigation = { calls: [], finishClose: null };
    window.__TAURI__.core.invoke = async (command, args) => {
      window.previewNavigation.calls.push({ command, args });
      if (command === 'close_document_reviews') return new Promise(resolve => {
        window.previewNavigation.finishClose = () => resolve({ ok: true });
      });
      return original(command, args);
    };
  });
  await page.locator('#nav-history').click();
  await page.locator('#nav-settings').click();
  assert.equal(await page.evaluate(() => window.previewNavigation.calls.filter(call => call.command === 'close_document_reviews').length), 1);
  await page.evaluate(() => window.previewNavigation.finishClose());
  await page.locator('#settings-view').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#documents-view').isVisible(), false);
  assert.equal(await page.locator('#details-run-id').textContent(), 'Lauf-ID: ' + 'b'.repeat(64));
  assert.equal(await page.evaluate(() => window.previewNavigation.calls.some(call => [
    'continue_history_batch', 'continue_review_session', 'start_admitted_batch',
    'decide_document_review', 'decide_document_review_batch', 'export_approved_documents'
  ].includes(call.command))), false);

  // Exercise the actual support controls with failed Core IPC. The save reply
  // is synthetic: this proves layout/status ownership, not a native file dialog.
  await page.goto(preview.url + '/workspace.html');
  await page.waitForFunction(() => !document.querySelector('#boot-status') || document.querySelector('#boot-status').hidden);
  await page.evaluate(() => {
    const original = window.__TAURI__.core.invoke;
    let saves = 0;
    window.__TAURI__.core.invoke = async (command, args) => {
      if (command === 'get_public_state') throw Error('STANDALONE_IPC_FAILED');
      if (command === 'get_native_recovery_status') return { phase: 'idle', diagnostic_log: 'ready', local_ui_only: true, external_disclosure: false };
      if (command === 'save_diagnostic_bundle') return ++saves === 1
        ? { ok: true, cancelled: true, saved: false, external_disclosure: false }
        : { ok: true, cancelled: false, saved: true, partial: true, external_disclosure: false };
      return original(command, args);
    };
  });
  await page.locator('#connection-help').waitFor({ state: 'visible' });
  await page.locator('#connection-diagnostic-save').click();
  assert.match(await page.locator('#connection-diagnostic-save-status').innerText(), /Abgebrochen/u);
  await page.locator('#nav-settings').click();
  await page.locator('#diagnostic-save').click();
  assert.match(await page.locator('#diagnostic-save-status').innerText(), /lokal gespeichert.*gekennzeichnet.*nichts hochgeladen/u);
  assert.equal(await page.locator('#connection-help').isVisible(), true, 'support save cannot clear the connection failure');
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'disconnected support reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'disconnected support axe ' + width);
  }
  await page.screenshot({ path: path.join(evidence, 'disconnected-diagnostic-package.png'), fullPage: true });
  // Actual workspace -> details -> iframe nesting, not just a bare review page.
  await page.goto(preview.url + '/workspace.html');
  await page.locator('#mode-anonymize').check(); await page.locator('#select-folder').click();
  await page.locator('#start').click(); await page.locator('#job-action-review').waitFor({ state: 'visible' });
  await page.locator('#job-action-review').click();
  const embedded = page.frameLocator('#review-frame');
  await embedded.locator('#review').waitFor({ state: 'visible' });
  for (const [width, height] of [[1920,1080],[1500,900],[1280,720],[1366,580],[683,384],[390,700]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nested review reflow ' + width);
    const box = await page.locator('#review-frame').boundingBox();
    assert.ok(box.width >= width - 50, 'review uses available width ' + width);
    if (width > 900 && height >= 700) {
      assert.ok(box.height >= height * .45, 'review has a usable desktop work area ' + width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), 'no outer desktop scrollbar ' + width);
    }
    for (const selector of ['.table-scroll','.matrix-detail','pre'])
      assert.equal(await embedded.locator(selector).first().evaluate(node => ['auto','scroll'].includes(getComputedStyle(node).overflowY)), false,
        'no nested vertical panel scroll ' + selector + ' ' + width);
    const reflow = await embedded.locator('body').evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 12).map(node => ({ tag: node.tagName, id: node.id, class: node.className, right: node.getBoundingClientRect().right })) }));
    assert.ok(reflow.width <= reflow.viewport + 1, 'iframe reflow ' + width + ' ' + JSON.stringify(reflow));
    for (const target of [embedded.locator('#matrix-body input[type=checkbox]').first(), embedded.locator('#defer')]) {
      await target.focus();
      assert.ok(await target.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return document.activeElement === node && rect.top >= -1 && rect.bottom <= innerHeight + 1;
      }), 'focused review control is not clipped ' + width);
    }
    const reviewAudit = await embedded.locator('body').evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(reviewAudit.violations.map(row => row.id), [], 'nested review axe ' + width);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await embedded.locator('#matrix-body input[type=checkbox]').first().focus();
  await page.screenshot({ path: path.join(evidence, 'uat-review-wide-workspace.png'), fullPage: true });
  assert.deepEqual(await embedded.locator('body').evaluate(() => window.previewSubmissions), [], 'layout/focus never makes a decision');
  assert.deepEqual(errors, []);
  console.log('WORKSPACE DESIGN PASS: actual v2 pages, both purposes, comparisons, raw masking exclusion, approval, authoritative filenames, R6 run/details navigation, exact copy/ACK binding, delayed-close single-flight, computed fonts, dialog/focus, axe and 390–1280px reflow; synthetic IPC, headless, not native acceptance');
} finally { await context.close(); await preview.close(); await browser.close(); }
