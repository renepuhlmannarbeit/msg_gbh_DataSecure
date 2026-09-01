# Arbeitsauftrag an Claude Code: aktueller DataSecure-Gesamtreview

Stand: 01.09.2026 · nach Dokumentenkonsolidierung ausführen

## Ziel

Prüfe unabhängig, ob Quellcode, gebautes Plugin-ZIP, privater Marketplace,
Skills, aktueller Dokumentenkanon und versionneutrales UAT-Kit denselben
Produktvertrag abbilden. Historische RC-Aufträge und Berichte unter `tasks/archiv`
oder `docs/archive` sind nur Kontext und dürfen nicht erneut abgearbeitet werden.

## Vorbereitung

1. `git pull` und sauberen Commit/Branch/Produktversion protokollieren.
2. Vollständig lesen: `docs/canonical/README.md`, `DECISIONS.md`, `PRODUCT.md`,
   `CURRENT_STATE.md`, `BACKLOG.md`, `TRACEABILITY.md`, `docs/TESTING.md`,
   `docs/acceptance/UAT_TEST_KIT/*`.
3. Aktuelle offizielle Anthropic-Dokumentation zu Plugins, Cowork, lokalen
   Plugin-MCPs, Marketplace und Organisationsrichtlinien gegenprüfen. Quellen und
   Abrufdatum nennen; keine unbelegte Versionsschwelle erfinden.

## Verbindlicher Produktvertrag

- Nutzerprodukt: Plugin-ZIP und identischer privater Marketplace.
- Internes Engineering-Artefakt: kein Nutzer-, Fallback- oder Releaseweg.
- Originalverarbeitung ausschließlich lokal über den Betriebssystempicker und nur
  bei aktiver lokaler Desktop-Brücke.
- Freigegeben: TXT, Markdown, CSV, DOCX. Alles andere bleibt fail-closed.
- Bilder: Pixel bleiben lokal, kein auswählbarer Bildmodus, niemals Originalbilder
  löschen.
- Retention: 0–14 Tage nur temporäre Arbeits-/Reviewdaten; Quellen/Originale und
  fertige Exporte niemals automatisch löschen.
- Plain-Arbeitskopien ohne Keyring, Keyfile, Passwort oder zusätzliche VM/Konto.
- Ein Start, ein Picker, eine Bestätigung, lokaler Hintergrundlauf, ein Abschluss;
  Ergebnislesen erst auf ausdrücklichen Folgeauftrag.

## Prüfungen

1. `claude --version`, `claude plugin validate plugins/data-secure --strict` und
   `claude plugin validate . --strict`.
2. `npm ci` nur bei passendem Lockfile/zulässiger Umgebung.
3. `npm run test:docs`, `npm run test:ci`, `npm run build:plugin`,
   `npm run test:plugin-zip`, `git diff --check`.
4. Plugin-ZIP extrahiert gegen `plugins/data-secure` auf Inhalt, Dateimodi,
   ausführbare Dateien, Offline-Lieferkette, Version und zwei Skills vergleichen.
5. Aktive Doku auf alte RC34/57/63-Aussagen, Keyring-/Crypto-Produktpfade,
   Nutzer-Engineeringartefakte, auswählbaren Bildmodus oder falsche Löschzusagen prüfen.
6. UAT: Jede Kennung muss Klartextname und gültigen Anleitung-Link besitzen;
   UAT-03/04 dürfen keine zu breiten PASS-Regeln enthalten.
7. Tests auf tote/obsolete Produktpfade und fehlende DS-067-Gates prüfen.
8. `claude plugin eval init --bare` nur in einem Wegwerfverzeichnis probieren.
   Bei Early-Access-Blocker inhaltsfrei als BLOCKED melden; kein Schema erfinden
   und keinen kostenpflichtigen Lauf ohne ausdrückliche Freigabe starten.

## Bericht

Findings nach P0/P1/P2/P3 mit Datei, Zeile, Reproduktion, Ist, Soll, Auswirkung und
zugehöriger DS-/BL-ID. Bestandene Tests und nicht ausführbare Nachweise getrennt
aufführen. Keine Produktivdaten verwenden. Keine fremden Findings mitbeheben.

Nur wenn der Auftraggeber ausdrücklich Umsetzung verlangt: ein Thema pro Commit,
Backlog/Current State/Traceability gemeinsam pflegen. **Nicht pushen.**
