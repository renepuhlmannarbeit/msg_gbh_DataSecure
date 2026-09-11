# Read-only Strukturreview GBH-BID-Skills für DataSecure Cowork

Archiv-ID: `ARCH-DOC-COWORK-BID-REVIEW-2026-09-11`

Stand: 11.09.2026. Vergleichsquelle war das fremde private Repository
`renepuhlmannarbeit/GBH-BID-Skills`; dort erfolgte ausschließlich lesender
Zugriff auf Revision `0389d184beecd3813295d0ea40e64b9e204ed7af`. Dieses
Dokument ist zeitgebundene Evidence, keine zweite
Produktwahrheit. Aktuell maßgeblich sind DS-099, BL-041.10 bis BL-041.13 und
`COWORK_INTERACTION_V1.md`.

## Übernommene Muster

1. Eine geschlossene maschinenlesbare Interaktionsregistry statt verstreuter
   Normal-/Support-/Destruktiv-/Idempotenzlisten.
2. Ein additiver öffentlicher Cowork-Statusumschlag, der Annahme, Abschluss,
   Retryklasse und Inhaltsgrenze eindeutig trennt.
3. Maschinenlesbare Human-Gates; Picker, ausdrückliche Bestätigung, späterer
   Folgeauftrag und Supportaktivierung sind unterschiedliche Autoritäten.
4. Produktnahe Golden Cases mit erforderlichen und verbotenen Outcomes,
   frischen Sitzungen und dreifacher Modellwiederholung.
5. Progressives Laden: kleiner Pflichtkern im Hauptskill, Intent-spezifische
   Referenzen und keine Supportdetails im Normalstart.
6. Kleine UML-Prüfsichten auf Intake, Fortsetzung/Review und Ergebnisübergabe.

## Bewusst nicht übernommen

- keine 34-Skill-Oberfläche und kein generischer BID-Artefaktumschlag;
- keine LLM-Subagenten in der Anonymisierung oder lokale Rohdatenübergabe;
- kein monolithischer PowerShell-Regexvalidator;
- keine Laufzeit-, Build- oder Vertrauensabhängigkeit vom Vergleichsrepository.

## Unabhängige Gegenchecks

Architektur, Security/Human-Gates und Teststrategie wurden getrennt gegen den
DataSecure-Code geprüft. Bestätigt wurden 10 Normal- und 17 Supportwerkzeuge,
strikte Eingabevalidatoren, getrennte Worker-/Sichtbarkeitszustände und die
serverseitige Abweisung von Supportaufrufen im Normalmodus. Zusätzlich erkannt
wurden die bisher duplizierte Gate-Semantik, fragmentierte Antwortformen, eine
falsche Supportklassifikation unbekannter Toolnamen und zwei fehlende
Modell-Goldenfälle. Diese Befunde sind unter DS-099 und BL-041.10 bis BL-041.13
gebunden; echte Claude-/Host-Evidence bleibt offen.

## Bewusst offene Nachweise und Grenzen

- Ein vom Modell gesendetes `confirmed=true` ist kein technischer Beweis für die
  Herkunft aus einer Nutzeräußerung. Eine echte Attestierung bräuchte einen
  Hostnachweis oder einen zusätzlichen lokalen Dialog. Gemäß DS-069 wird daraus
  ohne eigene Produktentscheidung keine Bestätigungsorgie; Modell- und
  Hostverhalten bleiben unter BL-041.7 sowie BL-041.11–.13 E1/E2-offen.
- Dass eine Ergebnisübergabe nur nach einem separaten Folgeauftrag beginnt, ist
  deshalb zusätzlich durch Skill, Promptvertrag und die 12×3-Candidate-Matrix
  abgesichert, aber erst in echter Cowork-Bedienung abschließend belegbar.
- Der Ergebnisordner-Reset verändert nur lokale Konfiguration und löscht weder
  Quelle noch Ergebnis. Seine Bediensemantik sowie ein bewusst gestarteter,
  prozessgebundener Supportmodus werden in derselben Zielhostabnahme geprüft.
- Das Engineering-Manifest enthält weiterhin die vollständige Supportfläche.
  Runtime und Tests erzwingen im Normalmodus die kleinere 10-Werkzeug-Projektion;
  ein neuer Registrytest verhindert Namensdrift zwischen Manifest und Server.
