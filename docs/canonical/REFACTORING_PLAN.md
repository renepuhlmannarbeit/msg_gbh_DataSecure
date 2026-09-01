# Aktiver Refactoring- und Migrationsplan

Stand: 01.09.2026 · Grundlage DS-065, DS-066 und DS-067

Der frühere Keyring-/Verschlüsselungsplan ist historisch und liegt im
[Archiv](../archive/2026-09/canonical-history/REFACTORING_PLAN_HISTORY_THROUGH_RC84.md).
Dieser Plan beschreibt ausschließlich die noch gültige Reihenfolge.

## R1 – Dokumenten- und Buildvertrag konsolidieren

1. Aktive Dokumente von historischen Nachweisen trennen.
2. ZIP/Marketplace als Produktbuild und MCPB als expliziten Engineering-Build
   technisch trennen.
3. UAT, README, Release-, Security- und Betriebsdokumente auf DS-067 prüfen.
4. Semantische Dokumentengates für Kanal, Retention, Bilder und Version ergänzen.

**Gate:** `npm run test:docs`, Produktartefakttests und Linkprüfung bestehen.

## R2 – Selbsttragende lokale Runtime

1. Die Plugin-ZIP enthält alle benötigten Laufzeiten; Nutzer installieren weder
   Node.js noch Python.
2. Rollenassembly, Start-, Abbruch-, Resume- und Unveränderbarkeitsnachweis
   schließen.
3. Windows x64 und macOS Intel/ARM getrennt paketieren und frisch installieren.

**Gate:** Kernfall läuft ohne System-Node; bei fehlendem/defektem Zielartefakt
stoppt das Plugin vor Originalzugriff. Linux folgt als eigenes Paket.

## R3 – Stapelkern und lokale Datengrenze

1. Plain-Arbeits-/Reviewkopien, Link-/Swap-Schutz und stapelweiten
   Pseudonymkontext abschließen.
2. Nur DataSecure-eigene temporäre Arbeits-/Reviewdaten unterliegen 0–14 Tagen.
3. Quellen/Originale und fertige Exporte sind nie Ziel automatischer Löschung.
4. Abbruch und Resume wiederholen keine terminalen Positionen.

**Gate:** Unit-, Negativ-, Crash-, Recovery-, Retention- und Mappingtests sowie
reale Windows-/macOS-Gegenproben bestehen.

## R4 – Einfache Cowork-Nutzerreise

1. Ein Satz oder direkte Skillauswahl öffnet genau einen lokalen Picker.
2. Eine Startbestätigung, kein Profil- oder Bildmodusdialog.
3. Hintergrundlauf ohne Claude-Polling; genau eine lokale Abschlussmeldung.
4. Ergebnislesen erst auf ausdrücklichen Folgeauftrag und in begrenzten Seiten.
5. Mehrdeutigkeit gesammelt lokal prüfen; Abbruch bleibt fortsetzbar.

**Gate:** versionneues UAT-Kit, beobachtete UX-/Accessibility-Abnahme und aktuelle
Claude-/Cowork-Hostevidenz.

## R5 – Content- und Formatfreigaben

1. TXT/Markdown/CSV/DOCX gegen reale Erzeuger und Zielsysteme abnehmen.
2. XLSX und PPTX erst nach vollständiger Struktur-/Objektcoverage freigeben.
3. PDF, Scan-PDF und Bilder bleiben bis zur vollständigen Risiko-, OCR- und
   visuellen Coverage gesperrt.
4. Passwortgeschützte/verschlüsselte Eingaben bleiben gestoppt und werden lokal
   gesondert gemeldet; kein Umgehungsweg.

**Gate:** jede neue Formatfreigabe benötigt Parser-, Differential-, adversariale,
Security-, Fach- und Drei-OS-Evidenz. Eine Endung allein genügt nie.

## R6 – Performance erst nach Sicherheit

1. Serielle Veröffentlichung und deterministische Reihenfolge bleiben fest.
2. Vorbereitung darf nur innerhalb der RAM-/Slot-/Bytebudgets parallelisieren.
3. Kalt/Warm, 1/10/100, CPU, Peak-RAM, p50/p95 und Gesamtzeit messen.
4. Aktivierung erst nach Crash-/Abbruch-/Dateisystem- und Referenzhardwaretests.

**Gate:** kein Sicherheitstest wird zugunsten eines Benchmarks gelockert; ein
unvollständiger Lauf zählt nicht als Performanceergebnis.

## R7 – Release und menschliche Freigabe

Reihenfolge: E0-Gates → Fresh Install Windows/macOS → Cowork/UAT → IT/Health-IT →
Datenschutz/Security/Architektur → Pilotentscheidung. MCPB-Evidenz ist optionales
Engineering-Wissen und weder Anwenderweg noch Produktfreigabe.
