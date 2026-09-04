# Vertrag: verschlüsselte private Artefakte v1

Status: **superseded durch DS-065 / RC80; historischer RC66-Vertrag, nicht mehr produktiv zu aktivieren** · Story: BL-011.13 ·
Abhängigkeiten: DS-050, `BATCH_SECRET_STORE_V1_LEGACY.md`,
[`BATCH_SNAPSHOT_V1.md`](../../../canonical/contracts/BATCH_SNAPSHOT_V1.md)

Aktueller Vertrag: [lokale Plain-Arbeitskopien](../../../canonical/contracts/PRIVATE_WORK_STORAGE_V1.md).
Keine neue Verschlüsselung, Schlüsselbundabfrage oder Migration verschlüsselter
Altbestände. Die unten beschriebene native Keyring-Abnahme ist wegen Scopewechsel
obsolet, nicht bestanden. Der historische Inhalt bleibt als Kontext erhalten.

## Zweck und Geltungsbereich

Dieser Vertrag schützt ausschließlich von DataSecure verwaltete, temporäre private
Artefakte: versiegelte Quellsnapshots, gegebenenfalls neustartfeste lokale
Reviewdaten und den minimalen neustartfesten Pseudonymkontext. Originalquellen,
dauerhafte anonymisierte Exporte und das lokale Mapping liegen ausdrücklich
außerhalb dieser Verschlüsselungsfassade und werden durch sie weder verändert noch
gelöscht.

Die E0-Produktintegration ist kein Release-Nachweis. Ein Release darf erst erfolgen,
wenn die gelockten nativen Secret-Store-Artefakte auf allen Releasezielen
offline sowie mit Prozesswechsel, Sperre, Neustart und Löschung belegt wurden.

## Schlüsselgrenze

- DataSecure erzeugt einen zufälligen 256-Bit-Installationsschlüssel.
- Der Schlüssel wird ausschließlich durch den freigegebenen OS-Benutzer-Secret-
  Store gehalten. Es gibt keinen Datei-, Umgebungsvariablen-, CLI-, Cloud-,
  Passwort-, Eigenableitungs- oder Klartextfallback.
- Die Kryptofassade erhält den Schlüssel nur über die injizierten engen
  `prepareWrite()`-/`commit()`-/`abort()`- und `resolveRead()`-Schnittstellen. Eine
  vorbereitete Generation wird erst nach der Veröffentlichung festgeschrieben;
  Fehler vor der Veröffentlichung brechen sie ab und entwerten keinen älteren
  dauerhaften Ciphertext. Ein fehlender, gesperrter, falscher oder widerrufener Store
  stoppt vor dem ersten Rohschreibzugriff mit einem festen inhaltsfreien Code.
- Schlüsselkopien im JavaScript-Speicher werden nach Verwendung bestmöglich
  überschrieben. Diese Maßnahme ersetzt keine native Speicherschutzgarantie.

## Envelope und Bindung

- Algorithmus: AES-256-GCM aus der mitgelieferten Node-Runtime.
- Jede Verschlüsselung verwendet einen kryptografisch zufälligen neuen 96-Bit-
  Nonce und einen vollständigen 128-Bit-Authentifizierungstag. Nonces dürfen unter
  demselben Schlüssel niemals wiederverwendet werden.
- Das Envelope besitzt eine feste Magie, Schema-/Algorithmusversion und strikt
  begrenzte Längenfelder. Unbekannte Versionen, zusätzliche Felder, Truncation,
  Überlänge oder Trailing Bytes stoppen geschlossen.
- Zweckklasse, opake Objektkennung und Vertragsversion sind Additional
  Authenticated Data. Dadurch dürfen Ciphertexte weder zwischen Snapshot, Review
  und Pseudonymkontext noch zwischen zwei Objekten wiederverwendet werden.
- Header, Fehlermeldungen, Diagnose und Journal enthalten niemals Rohwert,
  Dateinamen, Pfad, Quellhash, Klartextlänge außerhalb des technisch erforderlichen
  begrenzten Envelope-Felds oder Secretmaterial.

## Schreib-, Lese- und Commitgrenze

- Persistenz schreibt ausschließlich verschlüsselte Bytes in eine exklusiv
  erzeugte private `0600`-Tempdatei.
- Die V1-Fassade ist absichtlich **create-only**. Ein bestehendes Artefakt wird niemals
  ersetzt; pro Zweck-/Objektbindung ist ausschließlich Generation 1 zulässig.
  Ein zweiter Zielpfad darf keine verdeckte Rotation erzeugen. Rotation und
  Schlüsselrotation benötigt zusätzlich einen dauerhaften Pointer-/Recovery-Vertrag
  und bleibt einer späteren Vertragsversion vorbehalten. Die RC66-Migration betrifft
  ausschließlich gebundene Legacy-Klartextartefakte derselben Installation.
- Die Veröffentlichung verwendet eine atomare Create-if-absent-Hardlink-Promotion.
  Sie ersetzt auch dann kein Ziel, wenn ein anderer Prozess es genau zwischen
  Vorprüfung und Veröffentlichung erzeugt. Ein Commit ist erst nach vollständigem
  Write, Datei-`fsync`, erfolgreicher Promotion und – wo vom Betriebssystem
  unterstützt – Parent-Verzeichnis-`fsync` erfolgreich.
- Short-/Zero-Write, Encrypt-, Write-, Datei-`fsync`-, Link- oder Closefehler vor
  der Promotion veröffentlichen kein neues Artefakt und brechen die vorbereitete
  Schlüsselgeneration ab. Bereinigt werden nur die zu diesem Versuch gehörenden
  privaten Tempbytes; Originale und letzter dauerhafter Ciphertext bleiben
  unverändert.
- Ein Fehler nach erfolgreicher Promotion – etwa bei Identitätsprüfung,
  Temp-Unlink, Parent-`fsync` oder Secret-Commit – wird als
  `PRIVATE_ARTIFACT_DURABILITY_UNCERTAIN` gemeldet. Der veröffentlichte Ciphertext
  bleibt erhalten, die Schlüsselgeneration bleibt jedoch uncommitted/pending.
  Der persistente Commitmarker sperrt diesen Zustand. Das System darf ihn weder
  lesen noch erneut überschreiben oder als erfolgreichen Commit behaupten.
- Die komplette private Root einschließlich aller existierenden Ahnen muss lokal,
  link-/junction-/reparsefrei und ausschließlich für den OS-Benutzer beschreibbar
  sein. Root- und Parent-Inodes werden vor und nach der Operation gebunden.
  Hardlink-Create-if-absent sowie Crash-Dauerhaftigkeit sind pro freigegebenem
  Ziel-Dateisystem E1-Gates; es gibt keinen Rename-/Copy-Fallback.
- Secret-Store-Callbacks sind strikt synchron und geben `undefined` zurück. Ein
  Promise/Thenable oder anderer Rückgabewert stoppt geschlossen und darf nie als
  erfolgreicher Commit gelten.
- Lesen authentifiziert das vollständige Envelope vor jeder fachlichen Verwendung.
  Falscher Schlüssel oder Benutzer, falscher Zweck beziehungsweise Objektbezug,
  manipuliertes Tag, Truncation, Replay und unbekannte Version sind feste
  fail-closed Zustände.
- Ein Parser erhält entschlüsselte Bytes später ausschließlich über einen
  begrenzten vererbten Descriptor oder Stream. Eine zweite Klartextdatei ist kein
  zulässiger Integrationsweg.

## Rotation, Migration und Schlüsselverlust

- Die RC66-Migration von V2-Snapshots und Legacy-Reviewpreviews ist versioniert und
  rückrollbar. Zu jedem Zeitpunkt ist entweder der gebundene alte Klartext oder das
  vollständig durable neue Envelope autoritativ; neuer Klartext wird nie als
  Zwischenzustand persistiert. Schlüsselrotation ist nicht Bestandteil von V1.
- Ein fehlgeschlagener Migrationslauf darf weder alten Ciphertext noch Originale,
  Exporte oder Mapping entfernen.
- Bei Verlust oder Widerruf des OS-Schlüssels gibt es gemäß DS-050 keine
  Wiederherstellungs-Hintertür. Private Artefakte bleiben unlesbar und gesperrt.
  Erst eine ausdrückliche lokale Bestätigung darf DataSecure-eigene unlesbare
  Arbeitskopien verwerfen; anschließend kann aus einer weiterhin unveränderten
  Originalquelle ein neuer Auftrag entstehen.

## Verbindliche Evidenz vor Produktaktivierung

R4b-E0 umfasst Unit-/Negativtests für Ciphertext-at-rest, Nonce-/Tag-/Versionsvertrag,
Objektbindung, Manipulation, falschen Schlüssel, Truncation, Short-/Zero-Write,
Create-once-/Create-only-Rennen, transaktionale Generationen, Root-Ahnen- und
Pfad-/Inode-Bindung, synchrone Storegrenze, alle
Commitfehler, Migration und Crashrollback. E1 verlangt echte
Windows-DPAPI-/Credential-Manager- und macOS-Keychain-Läufe aus den finalen Offline-
Paketen sowie Hardlink-/Crash-Durability-Evidenz auf jedem freigegebenen
Dateisystem. E3 verlangt ein Security-Review des Formats, der nativen Lieferkette und
des aktiv verdrahteten Snapshot-/Review-/Parserpfads.
