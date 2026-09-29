// Real HTML/CSS/JS in Chromium; synthetic private IPC is deliberately a UI-only
// fixture, not evidence for the worker, OS dialogs or native target launch.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.route(/^https?:/u, route => route.abort());
  await context.addInitScript(() => {
    window.uiCalls = [];
    window.__TAURI__ = {
      event: { listen: async () => () => {} },
      core: { invoke: async (action, args) => {
        window.uiCalls.push({ action, args });
        if (action === 'frontend_ready') return { ok: true, product_version: '3.2.0-rc109' };
        if (action === 'get_ui_context') return { local_ui_only: true, external_disclosure: false,
          result_folder: 'C:\\Dokumente\\SecureDataMsg', source_folders: [], selected_files: [] };
        if (action === 'get_public_state') return { state: 'results_available', processing_mode: 'markdown-only',
          result_count: 4, results_available: true, selected_count: 4, completed_count: 4 };
        if (action === 'get_run_history') return { ok: true, local_ui_only: true, external_disclosure: false,
          entries: Array.from({ length: 20 }, (_, index) => ({ batch_id: index.toString(16).padStart(64, 'a'),
            created_at: new Date(Date.UTC(2026, 8, 6, 10, 30 - index)).toISOString(),
            processing_mode: index % 2 ? 'markdown-and-anonymize' : 'markdown-only',
            selected_count: 4, result_count: index === 1 ? 0 : 4, failed_count: 0,
            status: index === 1 ? 'stopped' : 'results_available',
            results_available: index !== 1, ledger_available: index !== 1, resumable: index === 1 })) };
        return { ok: true, handoff_confirmed: true };
      } }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(pathToFileURL(path.join(root, 'apps/datasecure-standalone/frontend/index.html')).href);
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Fertig');
  assert.equal(await page.locator('#home-view').isVisible(), true, 'completion never changes startup view');
  assert.equal(await page.locator('#processing-mode').inputValue(), '');
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const audit = async () => {
    const result = await page.evaluate(async () => window.axe.run(document, { runOnly: {
      type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
    assert.deepEqual(result.violations.map(value => ({ id: value.id, impact: value.impact,
      nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })), []);
  };
  await audit();
  await page.screenshot({ path: path.join(root, 'dist/standalone-home-preview.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Verlauf' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#history-body tr').length === 20);
  await audit();
  await page.locator('#history-body tr').nth(2).getByRole('button', { name: /Ergebnisordner/ }).click();
  const call = await page.evaluate(() => window.uiCalls.find(item => item.action === 'open_history_results'));
  assert.equal(call.args.batchId, (2).toString(16).padStart(64, 'a'));
  await page.screenshot({ path: path.join(root, 'dist/standalone-history-preview.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'narrow viewport must scroll the table, not the entire application');
  await audit();
  await page.getByRole('tab', { name: 'Start', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'dist/standalone-home-narrow-preview.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();

  const firstRunContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await firstRunContext.route(/^https?:/u, route => route.abort());
  await firstRunContext.addInitScript(() => {
    let folderChosen = false;
    let pickerCancelled = false;
    window.__TAURI__ = {
      event: { listen: async () => () => {} },
      core: { invoke: async (action) => {
        if (action === 'frontend_ready') return { ok: true, product_version: '3.2.0-rc142' };
        if (action === 'get_ui_context') return { local_ui_only: true, external_disclosure: false,
          result_folder: folderChosen ? 'C:\\Dokumente\\Mein Ordner' : 'C:\\Dokumente\\SecureDataMsg',
          result_folder_is_default: !folderChosen, source_folders: [], selected_files: [] };
        if (action === 'get_public_state') return { state: 'ready', results_available: false };
        if (action === 'configure_results') {
          if (!pickerCancelled) { pickerCancelled = true; return { ok: true, cancelled: true }; }
          folderChosen = true;
          return { ok: true, result_folder: 'C:\\Dokumente\\Mein Ordner',
            local_ui_only: true, external_disclosure: false };
        }
        return { ok: true };
      } }
    };
  });
  const firstRunPage = await firstRunContext.newPage();
  const firstRunErrors = [];
  firstRunPage.on('pageerror', error => firstRunErrors.push(String(error)));
  await firstRunPage.goto(pathToFileURL(path.join(root, 'apps/datasecure-standalone/frontend/index.html')).href);
  await firstRunPage.getByRole('heading', { name: 'Ergebnisordner festlegen' }).waitFor();
  await firstRunPage.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const firstRunAudit = await firstRunPage.evaluate(async () => window.axe.run(document, { runOnly: {
    type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  assert.deepEqual(firstRunAudit.violations.map(value => value.id), []);
  assert.match(await firstRunPage.locator('#result-folder-setup').innerText(), /beim ersten Start automatisch/u);
  await firstRunPage.screenshot({ path: path.join(root, 'dist/standalone-first-run-preview.png'), fullPage: true });
  await firstRunPage.getByRole('button', { name: 'Ergebnisordner auswählen' }).click();
  assert.equal(await firstRunPage.locator('#result-folder-setup').isVisible(), true,
    'cancelled picker leaves the guidance visible');
  await firstRunPage.getByRole('button', { name: 'Ergebnisordner auswählen' }).click();
  assert.equal(await firstRunPage.locator('#result-folder-setup').isVisible(), false,
    'explicit folder selection dismisses the guidance');
  assert.deepEqual(firstRunErrors, []);
  await firstRunContext.close();
  console.log('STANDALONE UI BROWSER PASS: home, history, first-run result folder, desktop/mobile layout, axe (UI fixture only)');
} finally { await browser.close(); }
