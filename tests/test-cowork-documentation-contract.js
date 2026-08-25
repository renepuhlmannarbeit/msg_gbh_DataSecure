'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const guide = read('docs/ANLEITUNG.md');
const review = read('docs/ANWENDERREVIEW.md');
const anonymize = read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/SKILL.md');
const explain = read('plugins/data-secure/skills/gbh-datasecure-datenschutz-erklaeren/SKILL.md');
const boundary = read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/references/sicherheitsgrenze.md');
const server = read('plugins/data-secure/server/index.js');
const all = [guide, review, anonymize, explain, boundary].join('\n');

for (const text of [guide, review, anonymize, explain, boundary]) {
  assert.match(text, /(?:Mehrfachpicker|Mehrfach-Datei(?:auswahl|dialog))/iu, 'picker normal path missing');
}
assert.match(guide, /„Öffnen“[^\n]{0,160}(?:einzige|genau einmal)/iu, 'single confirmation is unclear');
assert.match(anonymize, /genau einmal[^\n]*start_document_batch_from_picker/iu);
assert.match(anonymize, /weder `privacy_status`[^\n]*`open_input_folder`/iu);
assert.doesNotMatch(all, /ausschließlich[^\n]{0,100}`Input`-Ordner (?:kopieren|eingehen)/iu, 'old Input normal path returned');
assert.match(explain, /`Input` ist nur eine gesperrte technische Support-Inbox/iu);
assert.match(review, /genau acht Werkzeuge/iu);
assert.match(review, /Fortsetzung startet[^\n]{0,180}getrennte lokale Fachprüfung/iu);
assert.match(review, /vollständigen 28 Werkzeuge/iu);
assert.doesNotMatch(all, /höchstens zehn namenfreie Ergebnisse|Seiten von höchstens zehn/iu);
assert.match(anonymize, /pausierter oder fortsetzbarer Stapel blockiert[^\n]{0,100}neue Auswahl nicht/iu);
assert.doesNotMatch(server, /if\(status\.recoverable_batches>0\)return\{ok:false,error:'recoverable_batch_exists'/u,
  'paused batches must not block a new picker batch');

for (const text of [guide, review, anonymize, explain, boundary]) {
  assert.match(text, /lokal/iu, 'local host boundary missing');
  assert.match(text, /Cowork/iu, 'Cowork host boundary missing');
  assert.match(text, /(?:Cloud-Cowork|Cloud-gehostetes Cowork|Cloud-\/Scheduled)/iu, 'cloud Cowork exclusion missing');
}
assert.match(all, /(?:sichtbarer Skill|Plugin-Eintrag)[^\n]{0,140}(?:genügt nicht|kein Nachweis|niemals aus)/iu);

console.log('COWORK DOCUMENTATION CONTRACT PASS');
