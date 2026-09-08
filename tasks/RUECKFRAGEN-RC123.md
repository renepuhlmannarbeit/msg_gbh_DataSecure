# Rückfragen zum RC123-Arbeitsauftrag

Stand: 08.09.2026 · vorläufige Entscheidungen werden bis zur Bestätigung
fail-closed umgesetzt.

## F1 – Quellkopf in der Standalone-Privacy-Repräsentation

Zur Wahl stehen Weg A (generelle Änderung der neutralen Office-Extraktion) und
Weg B (Wiederherstellung eines eindeutig sensiblen Quellkopfs ausschließlich im
Standalone-Privacy-Adapter). Umgesetzt ist vorläufig Weg B. Er hält die bereits
abgenommene reine Markdown-Konvertierung byte- und inhaltssemantisch getrennt,
ändert Cowork nicht und repariert die Unterredaktion vor dem gemeinsamen Core.
Ein unabhängiges Restgate bleibt für nicht erkannte Köpfe bestehen.

Empfehlung: Weg B bestätigen. Weg A wäre erst sinnvoll, wenn die Office-
Extraktion eine formatübergreifend belegte, inhaltsneutrale Kopfsemantik erhält.

## F2 – Grenze für Personenwerte unter beliebigen Tabellenköpfen

Vorgeschlagen ist eine neue DS-Entscheidung: Der belegte Katalog operativer
Personenfelder wird automatisch redigiert. Ein namensförmiger Zweiwortwert unter
jedem anderen Tabellenkopf stoppt bis zu einer engeren, positiv belegten
Klassifikation fail-closed; er wird nicht geraten oder still freigegeben.
Dadurch können auch neutrale Werte wie `Berlin Mitte` oder `Status Offen`
konservativ stoppen.

Empfehlung: Diese sichere Zwischenregel bestätigen und erst anhand realer,
vollständig fiktiver Fehlstopp-Beispiele gezielt verfeinern. Die DS-Nummer wird
nicht eigenmächtig vergeben.
