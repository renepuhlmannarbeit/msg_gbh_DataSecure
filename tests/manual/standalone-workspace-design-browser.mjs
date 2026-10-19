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
console.log('HEADLESS_UI_EVIDENCE ' + evidence);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
try {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
  // Exercise real HTML/CSS/JS in a separate page so the existing workflow
  // scenarios retain their initial state. IPC and source files are synthetic.
  const ocrPage = await context.newPage(), ocrErrors = [];
  ocrPage.on('pageerror', error => ocrErrors.push(String(error)));
  try {
    await ocrPage.goto(preview.url + '/workspace.html');
    await ocrPage.locator('#select-folder').click();
    const folder = name => ocrPage.locator('.source-group').filter({ has: ocrPage.getByText(name, { exact: true }) });
    const parent = folder('Bewerbungen'), nested = folder('Entwicklung');
    assert.equal(await ocrPage.locator('#catalogue-ocr-count').innerText(), '1 Datei benötigt OCR');
    assert.equal(await parent.locator('.group-heading .folder-ocr').innerText(), '1 Datei benötigt OCR');
    assert.equal(await nested.locator('.group-heading .folder-ocr').innerText(), '1 Datei benötigt OCR');
    assert.equal(await folder('Projektleitung').locator('.folder-ocr').count(), 0, 'unknown PDF need is not inferred');
    assert.equal(await ocrPage.locator('.file-row .pill').filter({ hasText: /^OCR$/u }).count(), 1);
    await nested.locator('.collapse').press('Enter');
    assert.equal(await nested.locator('.group-files').isVisible(), false);
    assert.equal(await nested.locator('.group-heading .folder-ocr').isVisible(), true);
    await parent.locator('.collapse').click();
    assert.equal(await nested.isVisible(), false);
    assert.equal(await parent.locator('.group-heading .folder-ocr').isVisible(), true);
    await ocrPage.locator('#choose-none').click();
    assert.equal(await ocrPage.locator('#catalogue-ocr-count').innerText(), '1 Datei benötigt OCR');
    await ocrPage.locator('#mode-markdown').check();
    for (const enabled of [true, false]) {
      await ocrPage.locator('#text-ocr').setChecked(enabled);
      assert.equal(await parent.locator('.group-heading .folder-ocr').innerText(), '1 Datei benötigt OCR');
    }
    for (const [width, height] of [[1280, 900], [720, 560], [390, 700], [320, 700]]) {
      await ocrPage.setViewportSize({ width, height });
      assert.ok(await ocrPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'folder OCR page reflow ' + width);
      assert.ok(await ocrPage.locator('#source-tree').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'folder OCR tree reflow ' + width);
      const badge = await parent.locator('.group-heading .folder-ocr').boundingBox();
      const tree = await ocrPage.locator('#source-tree').boundingBox();
      assert.ok(badge && tree && badge.x >= tree.x && badge.x + badge.width <= tree.x + tree.width + 1,
        'collapsed folder OCR label is not clipped ' + width);
      const audit = await ocrPage.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'folder OCR axe ' + width);
      if (width === 1280 || width === 320) await ocrPage.screenshot({ path: path.join(evidence, `folder-ocr-collapsed-${width}.png`), fullPage: true });
    }
    await ocrPage.locator('#clear-files').click();
    assert.equal(await ocrPage.locator('#catalogue-ocr-count').isVisible(), false);
    assert.equal(await ocrPage.locator('#catalogue-ocr-count').textContent(), '');
    await ocrPage.locator('#select-folder').click();
    assert.equal(await ocrPage.locator('#catalogue-ocr-count').innerText(), '1 Datei benötigt OCR');
    assert.equal(await ocrPage.locator('#text-ocr').isChecked(), false);
    assert.deepEqual(ocrErrors, []);
    console.log('FOLDER OCR HEADLESS PASS: real heading/file badges, descendants, collapsed keyboard toggle, selection/consent independence, clear/readmission, axe and 320–1280px reflow; synthetic IPC, not desktop acceptance');
  } finally { await ocrPage.close(); }
  for (const automatic of [false, true]) for (const ocr of [false, true]) {
    const choicePage = await context.newPage();
    try {
      await choicePage.goto(preview.url + '/workspace.html');
      await choicePage.locator('#select-folder').click(); await choicePage.locator('#mode-anonymize').check();
      assert.equal(await choicePage.getByRole('radio', { name: 'Selbst entscheiden', exact: true }).isChecked(), true);
      await choicePage.locator('#fast-anonymize').check();
      assert.equal(await choicePage.locator('#manual-anonymize').isChecked(), false, 'real radio group is exclusive');
      await choicePage.locator('#mode-markdown').check(); await choicePage.locator('#mode-anonymize').check();
      assert.equal(await choicePage.locator('#manual-anonymize').isChecked(), true, 'changing purpose restores the existing guided default');
      assert.equal(await choicePage.locator('#fast-anonymize').isChecked(), false);
      await choicePage.locator(automatic ? '#fast-anonymize' : '#manual-anonymize').check();
      assert.equal(await choicePage.locator('#text-ocr').isChecked(), false, 'workflow never implies OCR');
      await choicePage.locator('#text-ocr').setChecked(ocr);
      await choicePage.locator('#start').click();
      await choicePage.waitForFunction(() => Boolean(window.previewLastStart));
      const request = await choicePage.evaluate(() => window.previewLastStart);
      assert.equal(request.reviewPolicy, automatic ? 'automatic-conservative' : undefined);
      assert.deepEqual(request.contentOptions, { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: ocr, imageOcr: ocr });
    } finally { await choicePage.close(); }
  }
  const progressPage = await context.newPage();
  try {
    let navigations = 0; progressPage.on('framenavigated', () => navigations++);
    await progressPage.goto(preview.url + '/workspace.html');
    await progressPage.evaluate(() => {
      const original = window.__TAURI__.core.invoke;
      window.progressProbe = { counter: 0, paused: false, reads: 0, commands: [], mutations: 0 };
      window.__TAURI__.core.invoke = async (command, args) => {
        if (command === 'pause_batch') { window.progressProbe.commands.push(command); window.progressProbe.paused = true; return { ok: true }; }
        if (command === 'get_public_state' && window.previewLastStart) {
          window.progressProbe.reads++;
          return { state: 'processing', batch_id: 'b'.repeat(64), processing_mode: 'markdown-and-anonymize',
            selected_count: 6, completed_count: window.progressProbe.counter, current_file: `Synthetic/File-${window.progressProbe.counter}.txt`,
            pause_requested: window.progressProbe.paused, external_disclosure: false };
        }
        return original(command, args);
      };
    });
    await progressPage.locator('#select-folder').click(); await progressPage.locator('#mode-anonymize').check(); await progressPage.locator('#start').click();
    await progressPage.locator('#job-action-pause').waitFor();
    const navigationBaseline = navigations;
    await progressPage.evaluate(() => {
      window.progressProbe.pauseButton = document.getElementById('job-action-pause');
      window.progressProbe.pauseButton.focus();
      window.progressProbe.observer = new MutationObserver(records => { window.progressProbe.mutations += records.length; });
      window.progressProbe.observer.observe(document.getElementById('job-actions'), { childList: true, subtree: true, attributes: true });
    });
    for (const counter of [1, 2, 3]) {
      await progressPage.evaluate(value => { window.progressProbe.counter = value; }, counter);
      await progressPage.waitForFunction(value => document.getElementById('job-current').textContent === `Synthetic/File-${value}.txt`, counter);
      assert.equal(await progressPage.evaluate(() => document.getElementById('job-action-pause') === window.progressProbe.pauseButton && document.activeElement === window.progressProbe.pauseButton), true);
    }
    assert.equal(await progressPage.evaluate(() => window.progressProbe.mutations), 0, 'background file changes retain actual buttons and attributes');
    assert.equal(navigations, navigationBaseline, 'progress performs no document or iframe navigation');
    assert.deepEqual(await progressPage.evaluate(() => window.progressProbe.commands), []);
    await progressPage.locator('#job-action-pause').click();
    await progressPage.locator('#job-action-pause').waitFor({ state: 'detached' });
    assert.deepEqual(await progressPage.evaluate(() => window.progressProbe.commands), ['pause_batch']);
    await progressPage.evaluate(() => window.progressProbe.observer.disconnect());
    console.log('MODE/PROGRESS HEADLESS PASS: four native radio/OCR combinations, exact start DTOs, stable background action nodes/focus, no navigation or command replay; synthetic IPC');
  } finally { await progressPage.close(); }
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
    const main = page.locator('#history-list [data-history-main="true"]').first();
    const accessibleName = [await main.innerText(), await page.locator(prefix + '-title').innerText(),
      await page.locator(prefix + '-identity').innerText()].join(' ');
    assert.equal(await page.getByRole('button', { name: accessibleName, exact: true }).count(), 1,
      'browser accessibility name contains the live visible label and the exact local run context');
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
    await page.evaluate(() => {
      const original = window.__TAURI__.core.invoke;
      window.previewCombinedCalls = [];
      window.__TAURI__.core.invoke = async (command, args) => {
        window.previewCombinedCalls.push({ command, args: structuredClone(args) });
        return original(command, args);
      };
    });
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
      assert.match(await page.locator('#documents-purpose').innerText(), /ohne weitere Dateiauswahl oder Exportbestätigung/u);
      assert.equal(await page.locator('#document-markdown').inputValue(), '');
      assert.equal(await page.locator('#documents-list .document-row input:visible').count(), 0, 'no second file selection');
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
    assert.equal(await page.locator('#documents-main-guide').isVisible(), false);
    assert.equal(await page.locator('#documents-approval-extras').isVisible(), false);
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
    assert.equal(await page.locator('#documents-approve').isVisible(), false, 'separate approval is optional and starts collapsed');
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
    assert.equal(await page.locator('#documents-all').isVisible(), false);
    assert.equal(await page.locator('#documents-export').isVisible(), false);
    assert.equal(await page.locator('#document-export-dialog').isVisible(), false);
    assert.equal(await page.locator('#documents-open-results').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.previewCombinedCalls.some(row =>
      ['decide_document_review', 'decide_document_review_batch', 'export_approved_documents', 'publish_result_documents'].includes(row.command))), false,
      'comparison/cancel never mutates or publishes');
    await page.locator('#documents-open-results').focus();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#documents-open-results').evaluate(node => getComputedStyle(node).outlineStyle !== 'none'), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(evidence, mode + '.png'), fullPage: true });
    await page.locator('#documents-open-results').click();
    assert.equal(await page.locator('#document-export-dialog').isVisible(), false);
    const opens = await page.evaluate(() => window.previewCombinedCalls.filter(row => row.command === 'open_history_results'));
    assert.deepEqual(opens.map(row => row.args), [{ batchId: 'b'.repeat(64) }]);
    assert.equal(await page.evaluate(() => window.previewCombinedCalls.some(row =>
      ['decide_document_review_batch', 'export_approved_documents', 'publish_result_documents'].includes(row.command))), false,
      'opening an initial result is a pure handoff, not publication/approval');
  }
  await page.goto(preview.url + '/workspace.html?demo=documents-raw-filter');
  await page.locator('#nav-history').click();
  const filteredRun = '#history-' + 'b'.repeat(64);
  await page.locator(filteredRun + '-more').click(); await page.locator(filteredRun + '-documents').click();
  await page.locator('#documents-filter-bar').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#documents-filter').inputValue(), 'notices');
  assert.equal(await page.locator('#documents-list .document-row').count(), 2);
  assert.ok((await page.locator('#documents-filter option').first().innerText()).includes('Mit Hinweisen (2)'));
  assert.equal(await page.locator('#documents-all').isVisible(), false);
  assert.equal(await page.locator('#documents-export').isVisible(), false);
  await page.locator('#documents-filter').selectOption('all');
  assert.equal(await page.locator('#documents-list .document-row').count(), 3);
  assert.match(await page.locator('#documents-selected').innerText(), /3 Ergebnisdateien verfügbar/u);
  await page.locator('#documents-filter').selectOption('edited');
  assert.equal(await page.locator('#documents-list .document-row').count(), 0);
  await page.locator('#documents-filter').selectOption('notices');
  await page.locator('#documents-list .document-row button').first().click();
  await page.waitForFunction(() => document.querySelector('#document-markdown').value.length > 0);
  await page.locator('#document-markdown').fill('# Projektleitung\nErika Linden\nE-Mail: korrigiert@example.invalid\n\nLeitung von 42 Projekten.\nSachinhalt und Qualifikationen bleiben erhalten.');
  await page.locator('#document-save-correction').click();
  await page.waitForFunction(() => document.querySelector('#documents-list').textContent.includes('Korrektur gespeichert'));
  await page.waitForFunction(() => document.querySelector('#documents-status').textContent.includes('Ergebnisstand bereitgestellt'));
  assert.equal(await page.locator('#documents-open-results').isEnabled(), true);
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
  assert.equal(await page.locator(fastPrefix + '-documents').innerText(), 'Nachbearbeitung öffnen (optional)');
  await page.locator(fastPrefix + '-documents').click();
  await page.locator('#documents-list .document-row').first().waitFor();
  assert.equal(await page.locator('#document-export-dialog').isVisible(), false);
  assert.match(await page.locator('#documents-purpose').innerText(), /automatisch maskiert, nicht manuell geprüft/u);
  assert.equal(await page.locator('#documents-main-guide').isVisible(), false);
  assert.equal(await page.locator('#run-guide-title').innerText(), 'Anonymisierte Ergebnisse bereit');
  assert.equal(await page.locator('#documents-all').isVisible(), false);
  assert.equal(await page.locator('#documents-approve').isVisible(), false);
  assert.equal(await page.locator('#documents-export').isVisible(), false);
  assert.equal(await page.locator('#documents-open-results').isEnabled(), true);
  // A delayed publication of an optional mask owns the view and cannot be
  // mistaken for another approval/export. Replies here are synthetic only.
  await page.locator('#documents-list .document-row button').first().click();
  await page.waitForFunction(() => document.querySelector('#document-markdown').value.length > 0);
  await page.evaluate(() => {
    const original = window.__TAURI__.core.invoke;
    window.publicationProbe = { calls: [], finish: null };
    window.__TAURI__.core.invoke = async (command, args) => {
      window.publicationProbe.calls.push({ command, args: structuredClone(args) });
      if (command === 'publish_result_documents') return new Promise(resolve => {
        window.publicationProbe.finish = async () => resolve(await original(command, args));
      });
      return original(command, args);
    };
  });
  await page.locator('#document-extra-actions > summary').click();
  await page.locator('#document-markdown').evaluate(node => node.setSelectionRange(0, 4));
  await page.locator('#document-redact').click();
  await page.locator('#document-change-save').click();
  try { await page.waitForFunction(() => Boolean(window.publicationProbe.finish)); }
  catch (error) {
    console.error('DIRECT_PUBLICATION_BROWSER_STATE', await page.evaluate(() => ({ calls: window.publicationProbe.calls,
      status: document.querySelector('#documents-status').textContent })));
    await page.screenshot({ path: path.join(evidence, 'direct-publication-failure.png'), fullPage: true }); throw error;
  }
  assert.equal(await page.locator('#documents-open-results').isEnabled(), false);
  assert.equal(await page.locator('#documents-back').isEnabled(), false);
  assert.equal(await page.locator('#document-change-save').isEnabled(), false);
  assert.match(await page.locator('#documents-status').innerText(), /Ergebnisstand wird sicher bereitgestellt/u);
  for (const [width, height] of [[1280,900], [720,560], [390,700]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'publication reflow ' + width);
    const audit = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
    assert.deepEqual(audit.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) })), [], 'publication axe ' + width);
  }
  await page.screenshot({ path: path.join(evidence, 'direct-results-publication-pending.png'), fullPage: true });
  await page.evaluate(() => window.publicationProbe.finish());
  await page.waitForFunction(() => document.querySelector('#documents-status').textContent.includes('Ergebnisstand bereitgestellt'));
  assert.equal(await page.locator('#documents-open-results').isEnabled(), true);
  assert.equal(await page.locator('#documents-publish').isVisible(), false);
  const publications = await page.evaluate(() => window.publicationProbe.calls.filter(row => row.command === 'publish_result_documents'));
  assert.deepEqual(publications.map(row => row.args), [{ batchId: 'b'.repeat(64) }]);
  assert.equal(await page.evaluate(() => window.publicationProbe.calls.some(row =>
    ['decide_document_review_batch', 'export_approved_documents'].includes(row.command))), false);
  await page.locator('#documents-open-results').click();
  assert.equal(await page.evaluate(() => window.publicationProbe.calls.filter(row => row.command === 'open_history_results').length), 1);
  assert.equal(await page.locator('#document-export-dialog').isVisible(), false);
  await page.screenshot({ path: path.join(evidence, 'direct-results-current-generation.png'), fullPage: true });

  // The completion->History bridge must read exactly this run once. Actual
  // queued disclosure events reuse that read without publishing/approving.
  await page.evaluate(() => {
    const original = window.__TAURI__.core.invoke;
    window.previewCompletionSummaryReads = [];
    window.__TAURI__.core.invoke = async (command, args) => {
      if (command === 'get_document_review_history_summary') window.previewCompletionSummaryReads.push(structuredClone(args));
      return original(command, args);
    };
  });
  await page.locator('#documents-completion-history').click();
  await page.waitForFunction(() => document.querySelector('#history-' + 'b'.repeat(64) + '-guide-title')?.textContent === 'Anonymisierte Ergebnisse bereit');
  assert.equal(await page.locator('#nav-history').getAttribute('aria-selected'), 'true');
  assert.deepEqual(await page.evaluate(() => window.previewCompletionSummaryReads.map(row => row.batchId)), ['b'.repeat(64)]);
  assert.equal(await page.locator(fastPrefix + '-disclosure').evaluate(node => node.open), true,
    'the explicitly expanded run remains expanded when returning from its editor');
  await page.locator(fastPrefix + '-disclosure').evaluate(node => {
    for (let index = 0; index < 3; index++) node.dispatchEvent(new Event('toggle'));
  });
  assert.equal(await page.locator(fastPrefix + '-guide-title').innerText(), 'Anonymisierte Ergebnisse bereit');
  assert.equal(await page.evaluate(() => window.previewCompletionSummaryReads.length), 1);
  await page.locator(fastPrefix + '-disclosure > summary').click();
  await page.waitForFunction(() => !document.querySelector('#history-' + 'b'.repeat(64) + '-disclosure').open);
  await page.locator(fastPrefix + '-disclosure > summary').click();
  await page.waitForFunction(() => document.querySelector('#history-' + 'b'.repeat(64) + '-guide-title')?.textContent === 'Anonymisierte Ergebnisse bereit');
  assert.equal(await page.evaluate(() => window.previewCompletionSummaryReads.length), 2,
    'an explicit close retires the proof; reopen may acquire one fresh read');
  assert.equal(await page.evaluate(() => window.publicationProbe.calls.filter(row => row.command === 'publish_result_documents').length), 1);
  assert.equal(await page.evaluate(() => window.publicationProbe.calls.some(row => row.command === 'export_approved_documents')), false);
  await page.screenshot({ path: path.join(evidence, 'completion-history-bound-summary.png'), fullPage: true });

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
  console.log('WORKSPACE DESIGN PASS: actual v2 pages, both purposes, comparisons, raw masking exclusion, direct result opening without approval/export selection, optional correction/full-vector publication, pending ownership, selected History summary, delayed-close single-flight, computed fonts, focus, axe and 390–1280px reflow; synthetic IPC, headless, not native acceptance');
} finally { await context.close(); await preview.close(); await browser.close(); }
