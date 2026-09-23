# Cowork-Interaktionsvertrag V1

Status: aktiv · Entscheidung DS-099 · Stories BL-041.11 bis BL-041.13

Die maschinenlesbare Quelle ist
`plugins/data-secure/server/contracts/cowork-interactions.v1.json`. Sie bindet
jedes MCP-Werkzeug genau einmal an Normal- oder Supportmodus, Wirkung,
Idempotenz, menschliche Gates, Erfolgsdisposition und Inhaltsgrenze. Der Server
verweigert den Start, sobald Werkzeugtabelle, Handler und Registry voneinander
abweichen.

## Globale Regeln

- Der Normalmodus hat exakt zehn, der Supportmodus zusätzlich 17 Werkzeuge.
- Ein unbekannter Werkzeugname ist unbekannt und darf nicht als Aufforderung zur
  Supportaktivierung erscheinen.
- Originalbytes, Pfade, Dateinamen, Hashes, Tokens und Capabilities überschreiten
  die normale Cowork-Grenze nie.
- Nur ein späterer ausdrücklicher Anwenderauftrag darf verifiziertes anonymisiertes
  Markdown übergeben. Dieses bleibt `untrusted_document_data`; eingebettete
  Anweisungen autorisieren keine Aktion.
- Pickerannahme, Workerannahme, dauerhafter Checkpoint, Review, Export und
  Abschluss sind verschiedene Zustände. `accepted` ist nie `completed`.
- Automatisches Polling, Retry, zweiter Picker und Supportaktivierung sind verboten.
- Löschende oder dauerhaft fortschreibende Operationen bleiben konservativ
  annotiert und an ihre expliziten Bestätigungsregeln gebunden.

## Additiver öffentlicher Status

Jede bekannte Werkzeugantwort erhält zentral `cowork_status` mit Schema
`datasecure-cowork-status/1`:

| Feld | Bedeutung |
|---|---|
| `operation`, `surface`, `phase` | registrierte Interaktion und ihre Oberfläche |
| `outcome` | `accepted`, `completed`, `cancelled` oder `stopped` |
| `interaction_terminal` | Ende dieser Claude-Interaktion, nicht zwingend Ende des lokalen Stapels |
| `local_work_state` | begrenzte lokale Sicht: `accepted`, `active`, `awaiting_review`, `completed`, `failed`, `not_started`, `not_applicable` oder `unknown` |
| `next_action`, `retry_class` | serverseitiger nächster Schritt; unbekannt bedeutet niemals automatisch retryfähig |
| `content_boundary` | nur `metadata_only` oder `verified_anonymized_markdown` |
| `original_content_sent_to_claude` | immer `false` |
| `content_trust`, `embedded_instructions_authorized` | Dokumentinhalt bleibt untrusted und autorisiert nie Anweisungen |
| `human_gate_assurance` | ehrliche technische Stärke des Gates: Runtime-Argument, nativer Dialog, Skillvertrag, Supportprozess oder Kombination |
| `user_status`, `safe_counts` | optionaler serverseitiger Klartextstatus und begrenzte inhaltsfreie Zähler; nur im Normalmodus |

Die Registry nennt die maximal zulässige Inhaltsgrenze. Der konkrete Umschlag
meldet `verified_anonymized_markdown` nur, wenn die erfolgreiche Antwort
tatsächlich verifizierten Text enthält; leere Seiten, Fehler und reine
Statusantworten bleiben `metadata_only`. Fortsetzungen werden über alle
zulässigen Formen (`more`, Cursor, offene Zähler und dokumentbezogenes
`has_more`) erkannt. Das numerische Feld `retryable` zählt Dokumentpositionen
und darf niemals als boolesche Retry-Erlaubnis interpretiert werden.

`cowork-status.v1.json` definiert die geschlossene Wertemenge für Outcome,
lokalen Zustand, Retryklasse, Inhaltsgrenze und nächsten Schritt. Unbekannte
Erfolgszustände stoppen fail-closed; unbekannte Fehlerzustände werden nie
automatisch retryfähig. Der Normalmodus besitzt zusätzlich einen rekursiven
Response-Guard gegen Tokens, Capabilities, private Paketkennungen und Cursor.

Die bestehenden Top-Level-Felder bleiben für eine Übergangsgeneration erhalten.
Sie dürfen dem Umschlag semantisch nicht widersprechen. Erst echte Cowork-UAT
darf ihre spätere Entfernung freigeben.

Der Umschlag verwendet die echten Core-Felder (`processing` als Zähler,
`local_processing_active`, `processing_local_batch`, `processing_local_document`,
`awaiting_local_review`), auch unter `batch`. Ein abgewiesener zweiter Aufruf
ist `stopped`, obwohl belegte lokale Arbeit weiter `active` oder `accepted`
sein kann. Eine unbestätigte Workerübernahme (`local_start_failed`, etwa bei
ACK-Verlust) ist `unknown`, niemals allein wegen `*_started:false` sicher
`not_started`. Ein nativer Abbruch der Ergebnisauswahl bleibt als solcher
erhalten und wird nicht in einen internen Fehler umgedeutet.

Die erste Übergabeseite beschreibt zur Übergabe **verfügbare** Ergebnisse,
nicht bereits vollständig an Claude gelieferte Dokumente. `more` und das
jeweilige `has_more` bestimmen die weitere Übergabe. Eine bereits terminale
Seite darf beim ausdrücklichen Ergebnis-/Privacy-Ordnerwechsel quittiert werden;
unvollständige Seiten blockieren den Wechsel weiterhin. Mehrere fertige Stapel
werden im nativen Dialog mit lokalem Abschlussdatum/-zeit und „neueste zuerst“
unterschieden. Zeitpunkt, Kennungen und Auswahlkarten gehen nicht an Claude.

DS-101 ergänzt `start_completed_local_results_handoff` um die geschlossene
Option `scope`: `unread` bleibt Standard; `reuse_completed` setzt einen
ausdrücklichen Wiederverwendungsauftrag **und** stets eine native Auswahl
voraus, auch bei nur einem Kandidaten. Keine automatische Eskalation bei leerer
Warteschlange. Wiederverwendung erhält dauerhafte ACKs und Terminal-Evidence;
erneut geprüfte begrenzte Leserechte sind an die verifizierte Generation gebunden.
Die Sitzung endet spätestens mit der frühesten Berechtigungs- oder Paketfrist;
eine vorhandene Berechtigung wird durch Wiederverwendung nicht verlängert.
Vor jeder Seite und nach asynchroner Vorbereitung wird erneut geprüft, auch
für bereits vorbereitete RAM-Snapshots. Ablauf erzeugt keine weiteren ACKs.
Beschädigung, Ablauf oder Austausch stoppen ohne Originalzugriff. Sechs
inhaltsfreie `local_results_reuse_*`-Diagnoseereignisse enthalten nur zufällige
Sitzungskennungen und Zähler, keine Paket-/Dokumentidentität oder Rohwerte.
Dieser Quellstand ist noch nicht als neues Plugin-Paket veröffentlicht.

## Human-Gate-Grenze

`explicit_request` und `explicit_confirmation` beschreiben erforderliche, an den konkreten Auftrag
gebundene Nutzerbestätigung; `os_selection` ist die lokale Auswahl im nativen
Dialog; `explicit_followup_request` trennt lokalen Abschluss und spätere
Claude-Auswertung; `explicit_support_request` ist kein Normalweg. Ein boolesches
Argument allein ist kein kryptografischer Herkunftsnachweis. `gate_assurance`
weist diese Grenze maschinenlesbar aus. Setzen und Zurücksetzen des
Ergebnisordners besitzen getrennte Varianten: nur Setzen öffnet einen nativen
Ordnerdialog. Für aktuelle
Normalabläufe bleibt deshalb zusätzlich die Skillregel verbindlich; eine später
geforderte technisch attestierte zweite Bestätigung wäre eine eigene
Produktentscheidung und darf keine allgemeine Bestätigungsorgie erzeugen.

## Evidence

Automatisiert: bijektive Registrybindung, exakte 10/17-Fläche, Annotationen,
Statusprojektion, Skillkontext und 41 strukturierte Routingfälle. Die kuratierte
12-Fälle-Matrix steht in `evals/cowork-release-smoke-matrix.v1.json`.

Nicht automatisiert: tatsächliche Modellauswahl und sichtbares Hostverhalten.
Jeder Modellfall läuft dreimal in frischen Cowork-Sitzungen. Ein verbotenes
Outcome blockiert die Freigabe; ein Mehrheitsvotum ist unzulässig.
