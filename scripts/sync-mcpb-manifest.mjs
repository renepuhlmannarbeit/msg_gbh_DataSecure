// Keeps the distributable MCPB manifest aligned with the runtime protocol.
// The runtime owns the behaviour; this file only carries install-time metadata.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const runtimePath = path.join(root, 'plugins', 'data-secure', 'server');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const source = fs.readFileSync(path.join(runtimePath, 'index.js'), 'utf8');
const { manifestPromptText } = await import(pathToFileURL(path.join(runtimePath, 'prompt-contract.js')).href);

function tableNames(table) {
  const start = source.indexOf(`const ${table}=[`);
  const end = source.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error(`MCPB_SYNC_${table}_TABLE_INVALID`);
  return [...source.slice(start, end).matchAll(/\{name:'([a-z_]+)',title:/g)].map((match) => match[1]);
}

const toolDescriptions = new Map(manifest.tools.map((tool) => [tool.name, tool.description]));
toolDescriptions.set('configure_privacy_folder', 'Öffnet nach ausdrücklicher Bestätigung einen lokalen Ordnerdialog, um den Privacy-Ordner auf diesem Gerät festzulegen.');
toolDescriptions.set('configure_result_folder', 'Öffnet einen lokalen Ordnerdialog für den dauerhaften Cowork-Ergebnisordner. Dort wird ausschließlich freigegebenes Markdown unter DataSecure-Output abgelegt.');
toolDescriptions.set('open_result_folder', 'Öffnet den dauerhaft gewählten DataSecure-Output-Ordner lokal, ohne Pfad oder Inhalt an Claude zu übertragen.');
toolDescriptions.set('start_document_batch_from_picker', 'Öffnet eine lokale Mehrfach-Dateiauswahl. Mit „Öffnen“ startet der bestätigte Stapel automatisch; Pfade und Namen bleiben lokal.');
toolDescriptions.set('continue_anonymized_batch_in_chat', 'Liest bei einer ausdrücklich gewünschten Folgeauswertung bis zu fünf verifizierte anonymisierte Markdown-Ergebnisse zusammen mit dem sicheren Batchstatus.');
toolDescriptions.set('start_completed_local_results_handoff', 'Startet auf ausdrücklichen Wunsch die tokenfreie lokale Übergabe abgeschlossener anonymisierter Ergebnisse an Claude.');
toolDescriptions.set('continue_local_results_handoff', 'Liest die nächste namenfreie Seite einer bereits gestarteten lokalen Ergebnisübergabe.');
toolDescriptions.set('cancel_local_results_handoff', 'Beendet ausschließlich die kurzlebige Ergebnisübergabe im Arbeitsspeicher; lokale Dateien und Ergebnisse bleiben unverändert.');
toolDescriptions.set('read_anonymized_documents', 'Liest bis zu zehn verifizierte anonymisierte Markdown-Dokumente mit ihren jeweiligen kurzlebigen Leseberechtigungen gesammelt.');
toolDescriptions.set('acknowledge_batch_documents', 'Bestätigt bis zu zehn tatsächlich ausgewertete freigegebene Stapeldokumente gemeinsam.');
manifest.tools = tableNames('TOOLS').map((name) => {
  const description = toolDescriptions.get(name);
  if (!description) throw new Error(`MCPB_SYNC_TOOL_DESCRIPTION_MISSING:${name}`);
  return { name, description };
});

const promptDescriptions = new Map(manifest.prompts.map((prompt) => [prompt.name, prompt.description]));
manifest.prompts = tableNames('PROMPTS').map((name) => ({
  name,
  description: promptDescriptions.get(name) || 'Dokumente lokal und datensparsam anonymisieren.',
  arguments: ['task'],
  text: manifestPromptText(name)
}));

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`MCPB manifest synchronized: ${manifest.tools.length} tools, ${manifest.prompts.length} prompts`);
