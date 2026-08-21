# DataSecure Companion API v1

Status: Vertrag, Job-Retention, privater IPC und nativer File Picker implementiert;
Review-UI und signiertes Packaging noch nicht implementiert.

## Zweck

Der Companion wird die lokale Sicherheitsgrenze zwischen Originaldateien und
Claude. Die API v1 legt zunächst das unveränderliche Jobmodell fest. Sie ist noch
nicht als MCP-Tool veröffentlicht: Claude darf Jobs weder reviewen noch überspringen
noch freigeben.

## Sicherheitsvertrag

- Job-IDs und lokale Action-IDs sind zufällige UUIDs.
- Das Journal enthält keine Dateinamen, Pfade, Rohwerte, Dokumenttexte oder
  Identitätsmappings.
- Jeder Zustandswechsel ist ein neues, exklusiv geschriebenes Ereignis. Bestehende
  Ereignisse werden nicht überschrieben.
- Lücken, Zusatzfelder, manipulierte Sequenzen oder unzulässige Übergänge blockieren
  den Job.
- `Reviewed`, `Skipped` und `Cancelled` benötigen eine lokale Nutzeraktion mit
  `channel=local_companion`.
- `Verified` verwendet ausschließlich den begrenzten Claim „Die unterstützten
  Prüfungen fanden keine weiteren Treffer“ und kennzeichnet, ob der Verifier
  heterogen oder noch eingeschränkt ist.
- `Released` ist nur nach `Verified` möglich und wird an den SHA-256 des Outputs
  gebunden.
- Claude erhält später nur den datensparsamen Jobstatus und veröffentlichte Outputs.
- Das Jobjournal nutzt dieselbe Aufbewahrungsfrist wie Outputs. Abgelaufene Jobs
  werden beim Serverstart entfernt; bei `retention_days=0` sind sie beim nächsten
  Cleanup-Lauf fällig.
- „Jetzt löschen“ ist als interne Companion-Funktion implementiert und verlangt eine
  exakte lokale Action-ID. Sie ist absichtlich kein MCP-Tool und damit nicht durch
  Claude auslösbar.
- Gelöscht werden ausschließlich direkte UUID-Jobordner mit regulären, nummerierten
  Journaldateien. Symlinks, Unterordner und unbekannte Einträge bleiben unangetastet
  und werden nur als datensparsame Fehlerzähler gemeldet.

## Zustandsautomat

```text
Created -> Claimed -> Extracted -> Detected -> Reviewed -> Verified -> Released
                                            \-> Skipped  -> Verified -> Released

Jeder nicht terminale Zustand -> Failed
Ausgewählte aktive Zustände    -> Cancelled (nur lokale Nutzeraktion)
```

`Released`, `Failed` und `Cancelled` sind terminal.

## Datensparsamer Status

Der Status enthält nur:

- API-Version, Job-ID, Zustand und Sequenz
- Erstellungs-/Änderungszeit
- fachliches Profil und Formatklasse
- `review_channel=local_companion_only`
- `model_can_review=false`, `model_can_release=false`
- `raw_content_available=false`

## Nächster Implementierungsschritt

1. Companion-Launcher an die MCP-Fassade anbinden und Packaging signieren.
2. Extraktionsergebnisse über versionierte Source-Locator-IDs an die lokale UI geben.
3. Lokale Review-/Skip-Action an einen echten UI-Klick und Output-Hash binden.
4. TXT-/DOCX-Vertical-Slice gegen diesen Zustandsautomaten integrieren.
