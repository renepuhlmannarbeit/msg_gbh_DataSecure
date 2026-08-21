# Aktueller Arbeitsauftrag

Diese Datei enthält immer den offenen Auftrag. Frühere Aufträge liegen in
`tasks/archiv/`.

Stand des Reviews: `4314fb2` "fix: scope profile name candidates to headers"

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # Node ist in Bash nicht im PATH
npm test        # 197 Fälle, müssen am Ende alle grün sein
npm run build   # muss durchlaufen
```

---

## Was am letzten Commit richtig ist und bleibt

Nicht zurückbauen:

- `endsProfileHeader()` schließt den impliziten Personenkontext an echten
  Abschnittsgrenzen. Das ist der strukturelle Fix, der verlangt war, und er
  funktioniert: die vier Substantivpaare bleiben in beiden Profilen erhalten,
  im Kopfbereich und im Körper, nachgemessen 16 von 16.
- Die Verengung des Kontextfensters von ±3 auf ±1 Zeile im Profilkörper, mit
  der Begründung im Kommentar.
- `ROLE_WORDS` wurde nicht erweitert. `base.js` ist unangetastet.
- Das Golden-File ist unverändert, die Zählungen stehen bei 1/2/2.
- Der Commit-Body benennt Finding, Ursache und Absicherung. So bitte weiter.

---

## R3 — Die Endungsheuristik lässt echte deutsche Namen durch

**Priorität: hoch.** Fehlerrichtung ist Unter-Redaktion. Ein echter Name bleibt
im freigegebenen Dokument stehen.

**Ort:** `plugins/data-secure/server/privacy/entities.js`,
`ABSTRACT_NOUN_ENDING_RE` und `hasAbstractNounShape()`, angewendet in den
Zweigen `commaName` und `particleName`.

Die Prüfung verwirft einen Kandidaten, wenn *jedes* Token auf `-ung`, `-nis`,
`-ment`, `-tion`, `-sion`, `-tät`, `-keit`, `-heit`, `-schaft`, `-lauf`,
`-lyse` oder `-wesen` endet. Deutsche Personennamen erfüllen das ebenfalls:

| Eingabe (`personnel_profile`) | Ist | Soll |
|---|---|---|
| `Jung, Dennis` | unverändert | `[PERSON_001]` |
| `Hartung, Denis` | unverändert | `[PERSON_001]` |
| `Jung, Denis` | unverändert | `[PERSON_001]` |
| `Hartung, Clement` | unverändert | `[PERSON_001]` |

„Jung" ist ein Nachname unter den häufigsten 200 in Deutschland, „Dennis" ein
verbreiteter Vorname. `rc3` hat `Jung, Dennis` noch erkannt, dieser Stand nicht
mehr. Das ist eine Regression in der Richtung, die der letzte Auftrag
ausdrücklich ausgeschlossen hat.

Der Radius ist begrenzt, weil `.every()` verlangt, dass *beide* Token die Form
haben — `Hartung, Peter` und `Meier, Dennis` werden weiterhin erkannt. Das
mildert, behebt es aber nicht.

### Mein Fehler im vorigen Auftrag

Die Ursache liegt nicht bei dir. Ich hatte verlangt, dass die Substantivpaare
**auch im Kopfbereich** erhalten bleiben. Im Kopf steht aber genau der Name;
dort ist eine Kommazeile per Wortform nicht von einem Namen unterscheidbar. Das
Kriterium war unerfüllbar, ohne eine Formheuristik zu bauen. **Ich ziehe es
zurück:** Über-Redaktion einer Fähigkeitszeile im Kopfbereich ist ab jetzt
akzeptabel.

### Zu tun

Die Endungsprüfung nicht bedingungslos anwenden, sondern nur, wenn das Dokument
bereits einen starken Personen-Anker enthält.

Hat `collectPersonAnchors()` eine Person gefunden — Anrede, `Name:`-Label,
Tabellenzelle, Caps-Zeile —, dann ist eine Kommazeile aus abstrakten
Substantiven mit hoher Wahrscheinlichkeit keine zweite Person, und die
Endungsprüfung darf sie verwerfen. Gibt es keinen Anker, ist die Kommazeile der
beste Namenskandidat im Dokument und muss pseudonymisiert werden, auch wenn ihre
Wortform nach Substantiv aussieht.

Gegen die Fälle geprüft:

- `Jung, Dennis` allein im Dokument → kein Anker → Endungsprüfung greift nicht
  → wird erkannt
- `Beratung, Umsetzung` in einem Profil, das auch `ERIKA BEISPIEL` enthält →
  Anker vorhanden → verworfen → bleibt erhalten
- `Beratung, Umsetzung` als einzige Kopfzeile ohne Anker → wird
  pseudonymisiert. Das ist die Über-Redaktion, die ich oben freigebe.

**Umsetzungshinweis:** `collectPersonSeeds()` in Zeile 262 ruft
`collectPersonAnchors(text)` bereits vor `collectHeaderNameCandidates(...)` auf.
Die Anker einmal berechnen und als zusätzlichen Parameter übergeben, statt sie
in `collectHeaderNameCandidates` erneut zu ermitteln. Die Funktion ist in
`module.exports` gelistet, der neue Parameter muss also einen Standardwert haben,
der das bisherige Verhalten nicht verändert.

Wenn sich beim Umsetzen zeigt, dass dieser Ansatz einen der vier Namensfälle
oben weiterhin durchlässt, dann **nicht ausliefern**, sondern melden. Lieber
`hasAbstractNounShape()` ganz entfernen und die Über-Redaktion im Kopfbereich in
Kauf nehmen, als einen Namen zu verlieren. Unter-Redaktion ist immer der
schlimmere Fehler.

### Tests

In `tests/test-pii-regression.js` als dauerhafte Absicherung:

- Die vier Namen aus der Tabelle werden in `personnel_profile` **und**
  `applicant` pseudonymisiert. Diese Fälle bleiben dauerhaft in der Suite; sie
  sind der Wächter gegen jede künftige Formheuristik.
- `Hartung, Peter`, `Meier, Dennis`, `Bergmann, Denis` werden weiterhin erkannt
  (nur ein Token mit Endung).
- Die vier Substantivpaare `Beratung, Umsetzung`, `Analyse, Konzeption`,
  `Migration, Schulung`, `Verzahnung, Nachlauf` bleiben **unterhalb einer
  Abschnittsüberschrift** erhalten, in beiden Profilen. Für den Kopfbereich ist
  keine Erhaltung mehr gefordert — falls ein Test das noch verlangt, anpassen und
  im Commit-Body begründen.
- Ein Profil mit Anker (`ERIKA BEISPIEL` als Caps-Zeile) *und* einer
  Substantiv-Kommazeile im Kopf: die Kommazeile bleibt erhalten, der Anker wird
  pseudonymisiert.
- `Mustermann, Max`, `Beispiel, Erika Maria`, `Anna von der Heide`,
  `Product Owner, Scrum Master` und `Ansprechpartner: Thomas Berger` unterhalb
  des Kopfbereichs verhalten sich unverändert.

---

## Nicht Teil dieses Auftrags

- **Aufbewahrung und Löschung.** `Processed`, `Output` und die Review-Bilder
  erfolgreicher Läufe wachsen unbegrenzt. Als „Known gap" in
  `docs/PLUGIN_SECURITY_MODEL.md` dokumentiert, eigene Aufgabe.
- Die Windows-Abnahme von OCR und EMF-Rasterisierung.
- Die `LICENSE` — Platzhalter, wartet auf juristische Prüfung.
- Eine Versionsanhebung. `3.2.0-rc3` bleibt.

## Abnahmekriterien

- [ ] `npm test` grün, Fallzahl ≥ 197 plus die neuen Fälle
- [ ] `Jung, Dennis`, `Hartung, Denis`, `Jung, Denis`, `Hartung, Clement`
      werden in beiden Profilen pseudonymisiert
- [ ] `Hartung, Peter`, `Meier, Dennis`, `Bergmann, Denis` unverändert erkannt
- [ ] Die vier Substantivpaare bleiben unterhalb einer Abschnittsüberschrift
      erhalten
- [ ] `ROLE_WORDS` weiterhin nicht erweitert
- [ ] `tests/expected/synthetic-personnel-profile.expected.md` unverändert;
      ändert es sich, ist das ein Hinweis auf einen unbeabsichtigten
      Nebeneffekt und kein zu bestätigendes Ergebnis
- [ ] Golden-Zählungen unverändert: PERSON 1, CUSTOMER 2, PROJECT 2
- [ ] Konvergenz weiterhin `passes === 1` für die vier Dokumentformen
- [ ] `npm run build` läuft durch, beide Artefakte entstehen
- [ ] `docs/TESTING.md` und die Fallzahl im README aktualisiert
- [ ] Commit-Body benennt Finding, Ursache und Absicherung
