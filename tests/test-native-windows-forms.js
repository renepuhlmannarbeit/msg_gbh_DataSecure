'use strict';

// Actual desktop interaction, NOT a headless or Tauri/package acceptance test.
// No product imports, fixtures or child processes before explicit opt-in.
const { nativeUiAuthorization, nativeCoverageStatus, nativeUiCaseCount } = require('./run-product-suite');

function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--status') {
    console.log(nativeCoverageStatus());
    return;
  }
  nativeUiAuthorization(args);

  const path = require('node:path');
  const childProcess = require('node:child_process');
  const { createSuite } = require('./helpers');
  const review = require('../plugins/data-secure/server/companion/text-review');
  const pii = require('../plugins/data-secure/server/pii-engine');
  const { residualPersonAmbiguities } = require('../plugins/data-secure/server/privacy/residual-person-review');
  const { showCompletionSummary } = require('../plugins/data-secure/server/companion/completion-summary');
  const { test, done, assert } = createSuite('Explicit native Windows forms (legacy adapters, not Standalone GUI acceptance)');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  // Synchronous ownership: timeout terminates the exact PowerShell child; these
  // fixtures do not launch Explorer, other executables or detached descendants.
  function run(command, commandArgs, input, env = process.env) {
    return childProcess.spawnSync(command, commandArgs, {
      input, env, encoding: 'utf8', windowsHide: true, shell: false,
      timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024
    });
  }

  function answer(script, draft) {
    const result = run(powershell, ['-NoProfile', '-NonInteractive', '-Sta', '-Command', script], JSON.stringify(draft));
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, String(result.stderr || ''));
    return JSON.parse(result.stdout);
  }

  const cases = [
    ['the real Windows completion form initializes and closes through the test-only path', () => {
      assert.strictEqual(showCompletionSummary({ selected_count: 2, released_count: 1, failed_count: 1 }, {
        platform: 'win32', testAutoClose: true, runner: run
      }), true);
    }],
    ['real Windows form applies one residual decision to each same-spelling occurrence', () => {
      const text = '[PERSON_001] – KEINE REALDATEN\n[PERSON_002] – KEINE REALDATEN';
      const profile = 'personnel_profile';
      const candidates = residualPersonAmbiguities(text, text, pii.scanResidual(text, profile, [], {
        strongPersonAnchor: true, includePersonCandidateSpans: true
      }));
      const draft = review.buildReviewDraft(text, text, profile, candidates);
      const script = review.powershellReviewScript().replace('[void]$form.ShowDialog()',
        '$form.Add_Shown({ $keep.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()');
      assert.deepStrictEqual(review.validateReviewResult(answer(script, draft), draft).decisions.map(item => item.decision), ['keep', 'keep']);
    }],
    ['the real Windows review form initializes and returns its selected redaction', () => {
      const anonymized = 'Kontakt: [PERSON_001]\nInterner Alias: Blauwal\nRolle: Lösungsarchitektin';
      const alias = 'Blauwal';
      const aliasStart = anonymized.indexOf(alias);
      const draft = review.buildReviewDraft('Kontakt: Erika Musterfrau\nInterner Alias: Blauwal\nRolle: Lösungsarchitektin', anonymized, 'customer');
      const script = review.powershellReviewScript().replace('[void]$form.ShowDialog()',
        `$form.Add_Shown({ $right.Select(${aliasStart}, ${alias.length}); $redact.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()`);
      const result = answer(script, draft);
      assert.strictEqual(result.action, 'reviewed');
      assert.deepStrictEqual(result.redactions, [{ end: aliasStart + alias.length, start: aliasStart }]);
      assert.match(review.applyManualRedactions(anonymized, result.redactions), /Interner Alias: \[MANUAL_REDACTION\]/u);
      assert.match(review.applyManualRedactions(anonymized, result.redactions), /Rolle: Lösungsarchitektin/u);
    }],
    ['the real Windows review form records an explicit ambiguity decision', () => {
      const value = 'Microsoft Azure Administrator Associate';
      const draft = review.buildReviewDraft(value, value, 'personnel_profile', [{
        ambiguity_id: 'credential:v2:000001', type: 'credential_issuer_ambiguous',
        original_start: 0, original_end: 9, anonymized_start: 0, anonymized_end: 9
      }]);
      const script = review.powershellReviewScript().replace('[void]$form.ShowDialog()',
        '$form.Add_Shown({ $keep.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()');
      assert.deepStrictEqual(answer(script, draft).decisions, [{
        ambiguity_id: 'credential:v2:000001', decision: 'keep'
      }]);
    }],
    ['the real Windows review form names the exact current finding after advancing', () => {
      const value = 'A: PO POAM\nB: QX QZ';
      const firstStart = value.indexOf('PO POAM');
      const secondStart = value.indexOf('QX QZ');
      const draft = review.buildReviewDraft(value, value, 'customer', [
        {
          ambiguity_id: 'person-residual:v1:000001', type: 'person_residual_ambiguous', replacement_kind: 'PERSON',
          original_start: firstStart, original_end: firstStart + 7,
          anonymized_start: firstStart, anonymized_end: firstStart + 7
        },
        {
          ambiguity_id: 'person-residual:v1:000002', type: 'person_residual_ambiguous', replacement_kind: 'PERSON',
          original_start: secondStart, original_end: secondStart + 5,
          anonymized_start: secondStart, anonymized_end: secondStart + 5
        }
      ]);
      const script = review.powershellReviewScript()
        .replace('[void]$form.ShowDialog()',
          '$form.Add_Shown({ $script:firstPrompt = $ambiguityInfo.Text; $script:promptWidth = $ambiguityInfo.Width; $script:promptY = $ambiguityInfo.Top; $script:buttonsY = $buttons.Top; $keep.PerformClick(); $script:secondPrompt = $ambiguityInfo.Text; $keep.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()')
        .replace('[Console]::Out.Write(($script:answer | ConvertTo-Json -Compress))',
          '[Console]::Out.Write((@{ first = $script:firstPrompt; second = $script:secondPrompt; width = $script:promptWidth; promptY = $script:promptY; buttonsY = $script:buttonsY; answer = $script:answer } | ConvertTo-Json -Compress -Depth 8))');
      const output = answer(script, draft);
      assert.match(output.first, /Aktuell 1\/2: «PO POAM»/u);
      assert.match(output.second, /Aktuell 2\/2: «QX QZ»/u);
      assert.ok(output.width > 500, 'the current finding should use the full dialog width');
      assert.ok(output.promptY < output.buttonsY, 'the current finding should sit directly above the decisions');
      assert.strictEqual(output.answer.action, 'reviewed');
    }],
    ['the real Windows review form lets a user go back and change an ambiguity decision', () => {
      const value = 'Microsoft Azure Administrator Associate\nScrum.org Professional Scrum Master I';
      const secondStart = value.indexOf('Scrum.org');
      const draft = review.buildReviewDraft(value, value, 'personnel_profile', [
        {
          ambiguity_id: 'credential:v2:000001', type: 'credential_issuer_ambiguous',
          original_start: 0, original_end: 9, anonymized_start: 0, anonymized_end: 9
        },
        {
          ambiguity_id: 'credential:v2:000002', type: 'credential_issuer_ambiguous',
          original_start: secondStart, original_end: secondStart + 9,
          anonymized_start: secondStart, anonymized_end: secondStart + 9
        }
      ]);
      const script = review.powershellReviewScript().replace('[void]$form.ShowDialog()',
        '$form.Add_Shown({ $keep.PerformClick(); $anonOrg.PerformClick(); $back.PerformClick(); $keep.PerformClick(); $approve.PerformClick() }); [void]$form.ShowDialog()');
      assert.deepStrictEqual(answer(script, draft).decisions, [
        { ambiguity_id: 'credential:v2:000001', decision: 'keep' },
        { ambiguity_id: 'credential:v2:000002', decision: 'keep' }
      ]);
      assert.match(script, /\$skip\.Visible = \(\$draft\.ambiguities\.Count -eq 0\)/u);
    }]
  ];
  assert.strictEqual(cases.length, nativeUiCaseCount, 'do not silently drop a migrated native form probe');
  for (const [name, body] of cases) test(name, body);
  return done();
}

module.exports = { main };

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode || 1; }
}
