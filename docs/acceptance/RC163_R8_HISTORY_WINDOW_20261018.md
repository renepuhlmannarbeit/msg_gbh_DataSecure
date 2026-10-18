# RC163-R8 – echtes Fünfer-Verlaufsfenster

Nutzerauftrag: nur die fünf neuesten Läufe registrieren, für den normalen
Verlauf prüfen und anzeigen. Keine Datei-/Ergebnislöschung; Desktop beim Nutzer.
Keine Veröffentlichung, Runner oder Mac-Zielhostabnahme. Timer bleibt PAUSED.
Das bestehende R7-Paket und seine Nachweise bleiben unverändert.

## Produktionsweg

- Neues geschlossenes privates Register `standalone-history-window/recent.json`
  enthält maximal fünf IDs mit ursprünglichem Anlagedatum. Getrennte synchrone
  logische Sperre hält die native Rootadmission über Read–Merge–Sort–Write und
  eigene Freigabe; gepinnte Eltern, tatsächliche Byte-/Objektprüfung, fsync und
  atomare Publikation. Gleichbleibende alte Workerupdates erzeugen keine neuen
  Registerschreibungen. Keine Aktualisierung mit dem heutigen Abschlussdatum.
- Normale Liste und vorbereitender Export-Capture beziehen IDs VOR Journal-,
  Summary-, Export-, Preference-, Inhalts- oder Identitätsdetaillesungen. Der
  bisherige globale Export-/Review-Captureindex wird dort nicht mehr benutzt.
  Ausgeblendete und fehlende Einträge werden innerhalb derselben Fünfermenge
  behandelt; ein sechster Lauf rückt nicht nach. Offenzähler ist auf die fünf
  Verlaufsläufe bezogen, nicht auf sämtliche erhaltenen Journale.
- Einmalige Bestandsübernahme liest begrenzte kompakte Summary-/Export-/bei
  bekanntem Token Journal-Suchmetadaten: maximal10000 Namen/64MiB insgesamt.
  Keine globale inhaltliche Prüfung oder Exportnachholung. Erst ausgewählte
  Kandidaten bekommen den unveränderten tatsächlichen Detail-/Ownerreader.
  Export-only-Altdaten behalten einen hashvalidierbaren separaten Legacy-Locator
  auch nach Verdrängung. Echte Batchanker und synthetische Aliase werden nicht
  doppelt gezählt; echte Journalanlage ersetzt ein nur abgeleitetes Suchdatum.
- Beschädigtes Register führt zu festem Verlaufsfehler, nicht zu einem globalen
  Fallback pro Poll. Seine Pflege ist ausdrücklich OPTIONAL für verbindliche
  Summarysicherung/Worker-Hooks/Recovery/Retention. Ein UI-Fehler verhindert
  weder Summary-Readback vor Journalentfernung noch folgende Ledger-Hooks.
- Exakte alte Ergebnis-/Fortsetzungsaktionen und explizite Laufdetails verwenden
  weiterhin tatsächliche einzelne IDs. Neue optionale Detail-ID läuft durch
  Renderer → Rustvalidierung → private IPC → Service → genaue Historyprojektion.
  Nicht mit Recovery-/Include-hidden-Optionen kombinierbar. Eine Exportgruppe
  hält dieselbe Root-/Exportverzeichnisbindung über alle höchstens fünf Reads.
- Gemeinsame Windows-/macOS-Quellenlogik; keine OS-Schutzfunktion, Rechte,
  Timeouts, Integritäts-/Freigabegrenzen oder Pluginfachlogik abgeschwächt.

## Quellengegenreview und Gegenproben

Unabhängiger KI-Architekturreview (keine menschliche Zertifizierung) fand und
ließ korrigieren: UI-Fehler darf verpflichtende Recovery nicht blockieren;
export-only-Altdaten müssen migriert werden; Exportgruppe braucht gemeinsame
Bindung; echte Batchanker dürfen nicht zusätzlich als Alias registriert werden.
Weitere aktuelle Gegenreviewergebnisse und finale Prüfbelege werden nach dem
unveränderten Abschlusslauf ergänzt.

Neuer echter Dateisystemtest sperrt alle alten Laufdateien und globalen
Historienverzeichnislesungen für normale Liste/Capture, prüft Neustart,
Hidden ohne Nachrücken, fehlende Dateien, kaputtes Register ohne Vollscan,
alte Worker, metadata-only-Migration und Locator ohne Öffnungsbefugnis.
Bestehende Quellen-/UI-/Sidecar-/Rust- und Pakettests bleiben erforderlich.

## Ehrliche Grenzen

Die Fünferanzeige löscht keine Altdateien oder fachlichen Belege. Die getrennte
vollständige Crash-Recovery und notwendiger Retentions-/Zuordnungsschutz bleiben
beim Start erhalten und können bei großem Bestand weiterhin Zeit beanspruchen.
Dieses Register ist KEIN Beweis, dass ein älterer Vorgang vollständig ist oder
gelöscht werden darf. Kein pauschaler Null-I/O-/Sofortstartanspruch. Frühere
R7-Vollsuite ist kein Beleg für den neuen R8-Stand. M2-/native Mac-Gates später.

## Abschlusslauf und unveränderter Kandidat

Produktinputhash a08125d25e89aa224559a2e0b4adf3710ea5c53a7202b1492f58f56e374dd62c
(328 Inputs, kein Gitcommit). Neuer create-only Abschlusslauf unter
dist/rc163-r8-history-final3-20261018. Prepare, Clippy,211 Rusttests/Release
bestanden,3 regulär ignoriert. Vollsuite266 Dateien plus10 Zusatzgates und
neue Paketgates noch laufend; keine alte R7-Freigabe übernehmen.
Test-/Scriptmanifest537 Inputs:
1f4026b4bc537e5304c59e19e18f5801816df8c2ffdfde8fbedd6b27654d78cb.
Unabhängige KI-Quellenreviewgrenzen stehen in INDEPENDENT-SOURCE-REVIEW.md.
Roter erster R8-Test (obsolete Erwartung verbot jetzt beabsichtigte exakte
Laufdetails-ID) erhalten; erlaubte Details nun Frame-Decoder-Roundtrip, ungültige
IDs/Quellpfade/Kombinationen bleiben negative Gegenfälle. Der zweite Vollversuch
lief während Weiterentwicklung und wurde an seinem verifizierten eigenen
Driver/Kindprozess beendet; keine doppelten Vollsuiten weiter betreiben.
Erste Native-Gates zwar alle0, aber geänderte Testinputs → passed:false, bleibt
ebenfalls erhalten. Ausschließlich final3 darf neuer gebundener Abschluss werden.
Letzte Quellenverschlankung: maximal fünf Locatorpublikationen nach Top5-Auswahl;
36 erhaltene Exportmetadaten und ein beschädigter alter Summarykandidat als
Gegenprobe bestanden. Zwei Quellenreviewrollen bestätigen den Schlussdiff ohne
weiteren konkreten Befund. Zielhostlaufzeitnachweise bleiben getrennt.
