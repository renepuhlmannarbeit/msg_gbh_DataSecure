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
const installation = read('plugins/data-secure/skills/gbh-datasecure-dokument-anonymisieren/references/plugin-oder-mcpb.md');
const readme = read('README.md');
const server = read('plugins/data-secure/server/index.js');
const all = [guide, review, anonymize, explain, boundary].join('\n');

for (const text of [guide, review, anonymize, explain, boundary]) {
  assert.match(text, /(?:Mehrfachpicker|Mehrfach-Datei(?:auswahl|dialog)|Datei- beziehungsweise Ordnerauswahl)/iu,
    'picker normal path missing');
}
assert.match(guide, /klicken einmal \*\*„Öffnen“\*\*/iu, 'single confirmation is unclear');
assert.match(anonymize, /genau einmal[^\n]*start_document_batch_from_picker/iu);
assert.match(anonymize, /weder `privacy_status`[^\n]*(?:Ordner|Supportwerkzeug)/iu);
assert.doesNotMatch(all, /ausschließlich[^\n]{0,100}`Input`-Ordner (?:kopieren|eingehen)/iu,
  'old Input normal path returned');
assert.match(explain, /(?:keinen technischen (?:Input-|Eingangs)ordner|nie durch einen[^\n]{0,80}technischen Eingangsordner)/iu);
assert.match(anonymize, /pausierter oder fortsetzbarer Stapel blockiert[^\n]{0,100}neue Auswahl nicht/iu);
assert.doesNotMatch(server, /if\(status\.recoverable_batches>0\)return\{ok:false,error:'recoverable_batch_exists'/u,
  'paused batches must not block a new picker batch');

assert.match(all, /lokal/iu, 'local host boundary missing');
assert.match(all, /Cowork/iu, 'Cowork host boundary missing');
assert.match(`${anonymize}\n${boundary}`, /lokale Plugin-MCPs laufen nicht in Cloud-Cowork/iu,
  'cloud Cowork must not be described as a bridged local-MCP path');
assert.match(`${anonymize}\n${boundary}`, /(?:Web|Desktop-Cloud)[\s\S]{0,220}keine Originale/iu,
  'cloud/web sessions must not process originals');
assert.match(all, /(?:sichtbarer Skill|Plugin-Eintrag)[^\n]{0,140}(?:genügt nicht|kein Nachweis|niemals aus)/iu);

for (const text of [guide, readme]) {
  assert.doesNotMatch(text, /\.mcpb|\bMCPB\b|Erweiterung installieren/iu,
    'engineering artefacts must not be an end-user installation path');
}
assert.match(installation, /MCPB.*nur intern/su);
assert.match(`${guide}\n${readme}`, /Plugin-ZIP[\s\S]*Marketplace/iu);
assert.doesNotMatch(`${guide}\n${review}`, /Grafik-Modus|balanced|remove_images|visual_mode/iu,
  'the ineffective visual-mode choice must not be user-facing');

assert.match(guide, /Claude pollt den Lauf nicht/iu);
assert.match(guide, /Bitten Sie erst danach ausdrücklich/iu);
assert.match(guide, /Quellen\/Originale: niemals automatisch verändern oder löschen/iu);
assert.match(guide, /Fertige Exporte[^\n]*niemals automatisch löschen/iu);
assert.match(guide, /0[–-]14 Tage/iu);

const { complianceHeader } = require('../plugins/data-secure/server/gateway/compliance');
const header = complianceHeader('general', { ext: '.txt', passes: 1, entityCount: 0, included: 0, review: 0 });
assert.doesNotMatch(header, /Persistente Rückzuordnung: nein/iu);
assert.match(header, /lokale Zuordnung von Originaldatei und Ergebnis vorhanden/iu);

console.log('COWORK DOCUMENTATION CONTRACT PASS');
