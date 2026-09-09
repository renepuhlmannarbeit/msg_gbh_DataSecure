# DataSecure Standalone unter Linux starten

Dieses Engineering-Paket ist auf Ubuntu 22.04 für Linux x64 mit glibc 2.35
oder neuer gebaut. Es benötigt weder Claude noch eine zusätzliche Node.js-,
Python- oder Rust-Installation.

1. ZIP vollständig in einen neuen lokalen Ordner entpacken.
2. Optional die SHA-256-Prüfsumme mit `sha256sum -c *.zip.sha256` prüfen.
3. Falls das Ausführungsrecht beim Übertragen verloren ging:
   `chmod u+x "DataSecure Standalone.AppImage"`.
4. `DataSecure Standalone.AppImage` öffnen oder im Terminal mit
   `./DataSecure\ Standalone.AppImage` starten.

Das Paket ist ein technischer Kandidat. Die sichtbare menschliche Linux-Abnahme
bleibt vor einer Endnutzerfreigabe offen. Sie umfasst Dateiauswahl,
Drag-and-drop, Ordneröffnung, Barrierefreiheit, Performance und die Installation
auf den unterstützten Linux-Distributionen.
