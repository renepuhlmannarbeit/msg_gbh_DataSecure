# Vertrag: unveränderlicher Stapel-Snapshot v1

Status: verbindlicher Zielvertrag · Story: BL-011.1 · Entscheidungen: DS-010,
DS-020, DS-021, DS-022 und DS-036

RC80 / DS-065: Neue Snapshots sind lokale Plain-Arbeitskopien ohne zusätzliche
Verschlüsselung. `datasecure-batch/4` und `private_artifact_plain: true` trennen sie
eindeutig von alten verschlüsselten V3-Beständen. Details und Altbestandsschutz:
[lokaler Speichervertrag](PRIVATE_WORK_STORAGE_V1.md). Original- und
Integritätsbindungen dieses Vertrags bleiben erhalten.

## Sicherheitsziel

Ein gestarteter Auftrag verarbeitet ausschließlich private Arbeitskopien, deren Bytes
beim Start atomar festgeschrieben wurden. Änderungen, Umbenennungen oder Löschungen
der Originale nach erfolgreicher Übernahme verändern den Auftrag nicht. Originale
werden niemals verschoben, verändert oder als Fortsetzungsbasis verwendet.

## Übernahmeprotokoll

1. Die lokale Oberfläche öffnet jede ausgewählte Quelle ohne Symlink-/Reparse-Point-
   Traversierung und prüft, dass sie eine reguläre Datei ist.
2. Sie kopiert die Bytes in einen neuen privaten Staging-Ordner unter einem zufälligen
   internen Item-Identifier. Quellpfade werden nicht in Jobjournal, Diagnose oder MCP-
   Antworten geschrieben.
3. Während des Kopierens werden Bytezahl und SHA-256 der Arbeitskopie gebildet. Nach
   `fsync` beziehungsweise dem plattformspezifischen Äquivalent werden Größe und
   Quellidentität erneut geprüft. Eine Änderung während der Übernahme verwirft nur
   diese unfertige Kopie und meldet eine erneut auswählbare Datei.
4. Erst wenn alle ausgewählten Dateien übernommen und die Grenzen geprüft sind, wird
   `snapshot.json.tmp` synchronisiert und atomar nach `snapshot.json` umbenannt. Vor
   diesem Commit existiert kein fortsetzbarer Stapel.
5. Nach dem Commit arbeiten Parser und OCR ausschließlich mit den versiegelten
   Arbeitskopien. Der Originalpfad wird nicht erneut geöffnet.

## Privater Zustand

`snapshot.json` enthält nur Schema-/Versionsstand, zufällige Batch- und Item-IDs,
Quellbasename für das spätere lokale Mapping, erkannten Dateityp, Bytezahl,
Arbeitskopie-Hash, Status, einen festen inhaltsfreien Checkpoint, optionale boolesche
`review_resumed`-/`analysis_acknowledged`-Marker sowie die lokale Executor-PID mit
Startzeit und Journalsequenz. Arbeitskopien tragen ausschließlich
zufällige interne Namen. Das gesamte Verzeichnis muss nur für den aktuellen Benutzer
zugänglich sein und bekannte Sync-/Netzwerkpfade ablehnen.

Der Quellbasename ist vertraulicher lokaler Zustand: Er darf ausschließlich in die
dauerhafte Mapping-CSV exportiert werden und bleibt für MCP, Claude, Audit und
Diagnose unsichtbar. Hashes der Arbeitskopien verlassen den privaten Job Store nicht.

## Zustands- und Fortsetzungsregeln

- Pro Benutzer darf höchstens ein Stapel lokal ausgeführt werden. Seine PID-basierte
  Executor-Lease ist ausschließlich lokaler technischer Zustand; ein lebender Owner
  blockiert zweiten Start, Resume, Review, Verwerfen und Ablaufbereinigung.
- Zulässige Itemzustände sind `pending`, `processing`, `delivery_pending`, `released`,
  `retryable`, `deferred_review` und `stopped`. `deferred_review` enthält nur den
  festen Checkpoint `awaiting_local_review`, niemals einen Entwurf, Fundstellen,
  Entscheidungen oder Rohwerte. Der übrige Stapel kann weiterlaufen; erst eine
  ausdrückliche Fortsetzungsbestätigung setzt ihn wieder auf `pending`. Ein
  `retryable`-Eintrag wird ebenfalls nur nach ausdrücklicher Bestätigung wieder zu
  `pending`; `review_resumed` verhindert beim nächsten technischen Verarbeitungsschritt
  nur die erneute automatische Vertagung und enthält keinerlei fachliche Entscheidung.
  Ein `stopped`-Eintrag bleibt terminal gesperrt.
- Der Checkpoint beschreibt ausschließlich eine feste technische Phase (`sealed`,
  private Kopie, Extraktion, Textprüfung, Paketverifikation, Übergabe oder
  Terminalzustand). Er enthält weder Fundstellen noch Rohwerte, Namen oder Pfade und
  wird niemals über MCP, Audit oder Diagnose offengelegt.
- Jeder Übergang erhält eine monotone Sequenz und wird vor dem nächsten Seiteneffekt
  atomar persistiert. Ein Neustart leitet den nächsten Schritt nur aus Snapshot und
  Journal ab; `released` wird nie erneut verarbeitet.
- Ein Absturz in `processing` wird zu `retryable`, sofern kein atomar
  verifiziertes Ergebnis existiert. Ein vorhandenes verifiziertes Ergebnis wird
  über seine zufällige Item-Paketkennung, sein Manifest und seinen Markdown-Hash
  übernommen, nicht neu erzeugt. Sein Mapping-Commit ist idempotent.
- Der normale lokale Executor übernimmt ein verifiziertes `delivery_pending`-Paket
  unmittelbar in `released`, bereinigt seine private Arbeitskopie und verarbeitet die
  nächste Position, ohne auf Claude zu warten. `delivery_pending` bleibt als enger
  Crash-/Legacy-Übergang zulässig und wird deterministisch übernommen, nie neu erzeugt.
  `analysis_acknowledged` dokumentiert davon getrennt nur, ob Claude das freigegebene
  Paket für die aktuelle Aufgabe bereits ausgewertet hat. Ein KI-Abbruch ändert weder
  `released` noch Mapping, Evidenz oder lokalen Batchabschluss.
- Freigegebene Ergebnisse werden ausschließlich über einen Batch-gebundenen,
  authentisierten Cursor in Seiten bis 20 Einträgen angeboten. Die Liste enthält
  keine Quellnamen oder Pfade; jede Leseberechtigung bleibt kurzlebig und paketgebunden.
  Offene private Kopien verfallen spätestens nach 14 Tagen.
- Lösch- oder Persistenzfehler werden sichtbar und blockieren eine widersprüchliche
  Freigabe; sie führen nicht zu einem stillen Neustart des gesamten Stapels.

## Verpflichtende Gegenproben

Die Implementierung muss Originaländerung nach Commit, Änderung während Kopie,
Symlink/Junction, gleichnamige Quellen, Absturz vor und nach Ergebnis-Commit,
Stromausfallfenster, vollen Datenträger, konkurrierenden zweiten Stapel sowie
Fortsetzung nach Prozess- und Rechnerneustart testen.
