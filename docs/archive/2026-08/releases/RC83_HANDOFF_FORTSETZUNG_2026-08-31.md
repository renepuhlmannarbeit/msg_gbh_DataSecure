# RC83: Ergebnisübergabe nach Unterbrechung fortsetzen

Stand: 31.08.2026 · Basis RC82 · lokale Implementierung

## Korrektur

Nach einer bereits bestätigten Seite zeigte die lokale Kandidatenliste korrekt nur
die ungelesenen Ergebnisse, übernahm aber Qualitäts- und Auslassungszähler des
gesamten Stapels. Der strikte Cowork-Handoff erkannte diesen Widerspruch und stoppte
mit `LOCAL_HANDOFF_VERIFICATION_FAILED`.

RC83 lässt den vollständigen, identitätsgebundenen Stapelnachweis unverändert als
Sicherheitsvoraussetzung bestehen. Erst danach wird eine separate Zusammenfassung
aus ungelesenen Ergebnissen und sicher gestoppten Dateien gebildet. Bereits
bestätigte Ergebnisse werden nicht erneut gelesen; ihr Ergebnisgrad und ihre
Auslassungen erscheinen nicht erneut in der Restübergabe. Gesamtstatus und lokaler
Auditnachweis bleiben unverändert.

Zusätzlich wurde ein Pagingfehler korrigiert: Wenn nach einer vollen Seite nur
sicher gestoppte oder bereits bestätigte Journaleinträge folgten, meldete die API
fälschlich eine weitere Ergebnisseite. Cowork führte dadurch einen unnötigen
Werkzeugaufruf aus und erhielt eine leere Seite. Der Cursor zeigt jetzt nur noch
auf ein tatsächlich ungelesenes Ergebnis oder bleibt leer.

Auch der dateibasierte Ausweichpfad für große Ergebnisse ist jetzt Unicode-sicher.
Zuvor konnte eine Seitengrenze zwischen den beiden UTF-16-Hälften eines Emojis
liegen, wenn kein RAM-Snapshot verwendet wurde. Beide direkten Folgeseiten bleiben
nun gültiger Text und ergeben zusammengesetzt exakt das freigegebene Markdown.
Der direkte und der RAM-basierte Leser lehnen außerdem einen von außen vorgegebenen
Offset innerhalb eines Unicode-Zeichens ab. Hash-gültige, aber ungültig UTF-8-
kodierte Markdown-Bytes werden im Ausweichpfad nicht mehr als Ersatzzeichen
weitergegeben. Ein seltener Deskriptor-Schließfehler bleibt fail-closed und kann
keine native Pfad- oder Systemmeldung ausgeben.

Die Mehrfachauswahl verwendet die Dateipfadidentität jetzt plattformspezifisch.
Nur Windows vergleicht Pfade ohne Beachtung der Groß-/Kleinschreibung; Linux und
case-sensitive macOS-Volumes dürfen zwei echte Dateien wie `Profil.txt` und
`profil.txt` gemeinsam auswählen.

Ein erneuter Defektsuchlauf schließt fünf weitere Randklassen: Synchrone Datei-
und Ordnerdialoge verwerten keine Teilausgabe eines fehlgeschlagenen Helfers;
auch der lokale Passwortdialog verwirft und überschreibt solche Teilausgaben.
Der Windows-Dialog für den Privacy-Ordner setzt wie die übrigen PowerShell-Dialoge
explizit UTF-8, sodass Umlaute und nichtlateinische Pfade unverändert ankommen.
Native Dateisystemfehler vor dem verifizierten Lesen bleiben pfadfrei; schlägt nur
die Größenprüfung des optionalen RAM-Snapshots fehl, fällt der Handoff auf den
bereits verifizierten Seitenleser zurück. Ändert sich die Zahl freigegebener oder
gestoppter Ergebnisse zwischen lokaler Kandidatenwahl und erster Ergebnisseite,
stoppt der Handoff mit `LOCAL_HANDOFF_CHANGED`, statt eine veraltete Zusammenfassung
an Cowork auszugeben. Eine strukturell beschädigte interne Ergebnisseite wird
ebenfalls mit einer festen, inhaltsfreien Verifikationsmeldung abgelehnt.

Schema-1-Altstapel erhalten weiterhin keine erfundenen Ergebnisgrade. Ungültige
Nachweise oder ein nicht zum Journal passendes verbleibendes Paket werden nicht zu
einer verifizierten Übergabe aufgewertet. Die Restprojektion verursacht bei modern
vollständig verifizierten Stapeln keinen zweiten Paket-Hashdurchlauf.

## Automatisierte Nachweise

- 20 integrierte Abbruch-/Fortsetzungstests kombinieren Produktionskomponenten für
  Ergebniszugriff, Fortschrittsprojektion, Paging und Cowork-Handoff.
- Stapel mit 1, 6, 11 und 100 Ergebnissen: Cancel, Ablauf und Prozessneustart.
- Gemischte vollständige/ausgelassene Ergebnisse, zwei Auslassungsarten und sicher
  gestoppte verschlüsselte Datei für Batch-Schema 2 und 4.
- Legacy-Schema 1, ungültiger Vollstapelnachweis, beschädigtes bereits bestätigtes
  Paket und abweichendes verbleibendes Paket.
- Keine erneute Ausgabe bestätigter Ergebnisse, keine Umschreibung der
  Terminal-Evidence und keine Änderung der Gesamtzähler.
- Ein zusätzlicher Paging-Negativtest verhindert leere Folgeseiten nach genau fünf
  Ergebnissen. Eine weitere Regression prüft die Unicode-Grenze des dateibasierten
  Ausweichpfads. Vier weitere Regressionen prüfen ungültiges UTF-8, fremde
  Unicode-Offsets, neutrale Schließfehler und case-sensitive POSIX-Dateipfade;
  fünf weitere Regressionen sichern Helfer-Teilausgaben, Windows-UTF-8,
  Dateisystemfehler, die Handoff-Zählerrace und beschädigte Ergebnisseiten ab;
  insgesamt 32 neue
  Defectregressionen.

Die vollständige lokale `npm run test:ci` einschließlich Pre-/Posttests besteht.
Der Paketbau besteht mit 150/150 Anonymisierungsvarianten gegen den gepackten Code,
ZIP-/MCPB-Quellparität, Status-/SBOM-/Lizenz- und Produktgrenzen. Die offizielle
Claude CLI 2.1.233 validiert Plugin und Marketplace strukturell. Keine GitHub
Actions. Keine echte Cowork-/OS-Geräteabnahme aus den synthetischen Tests ableiten.
