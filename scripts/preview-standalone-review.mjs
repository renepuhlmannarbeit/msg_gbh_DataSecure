import { startReviewPreview } from './lib/standalone-review-preview.mjs';
const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const preview = await startReviewPreview({ port: Number(value('--port') || 8765), conceptPath: value('--concept'), workspace: args.includes('--workspace') });
console.log(`Entwicklungsvorschau (nur synthetische Daten): ${preview.url}/review.html?demo=ocr`);
if (value('--concept')) console.log(`Ausgewählter HTML-Entwurf: ${preview.url}/concept.html`);
if (args.includes('--workspace')) console.log(`Neue Hauptoberfläche: ${preview.url}/workspace.html`);
console.log('Nur 127.0.0.1. Beenden mit Strg+C. Kein Bestandteil der ausgelieferten App.');
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return; closing = true; await preview.close();
});
