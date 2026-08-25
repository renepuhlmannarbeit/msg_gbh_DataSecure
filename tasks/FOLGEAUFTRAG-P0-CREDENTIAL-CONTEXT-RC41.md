# Folgeauftrag: P0-Härtung des Zertifikats-/Kundenkontexts nach RC41

**Status:** offen, releaseblockierend  
**Ausgangsstand:** `main` auf RC41  
**Story/Entscheidung:** BL-031.1, DS-012  
**Quelle:** unabhängiges Gegenreview zu `068c0cc`, `b7b7e02` und `4e9caf9`

## Ziel

Schließe die im RC41-Gegenreview reproduzierten Unter-Redaktionen im
Zertifikatskontext, ohne echte Zertifikatsaussteller oder fachliche Inhalte unnötig
zu anonymisieren. Unter-Redaktion bleibt die schwerere Fehlerrichtung.

## Reproduzierbare P0-Fälle

1. `Zertifizierungen\nZertifikat: AWS Certified Cloud Practitioner – weitere Informationen bei alpha-health.de`
   lässt `alpha-health.de` unverändert. Ursache: `isCredentialIssuerDomain()` schützt
   seit `4e9caf9` jede domänenförmige Fundstelle, sobald irgendein Credential-Cue vor
   ihr auf derselben Zeile steht. Der Cue belegt aber nicht, dass die Domain der
   Aussteller ist.
2. `Zertifizierungen\nWährend meiner Tätigkeit für Nordlicht Beispiel AG erwarb ich ISTQB Certified Tester.`
   lässt `Nordlicht Beispiel AG` unverändert. `NON_ISSUER_LABEL_RE` kennt `tätig für`,
   aber nicht die gleichbedeutende Nominalform `Tätigkeit für`.
3. `Zertifizierungen\nZertifikat erworben im Auftrag von Alpha Beispiel GmbH, ausgestellt durch Scrum.org.`
   lässt `Alpha Beispiel GmbH` unverändert. Die Kundenbeziehung `im Auftrag von` wird
   nicht erkannt.

Zusätzliche Über-Redaktionsfälle, die bei der Lösung erhalten beziehungsweise
korrigiert werden müssen:

- Ein mehrzeiliger Block `Zertifikat ausgestellt von\nScrum.org` anonymisiert den
  echten Aussteller als URL.
- Ein echter synthetischer Ausstellername wie `Customer Institute GmbH Certified
  Testing Professional` wird wegen des führenden Wortes `Customer` als Kunde
  anonymisiert.

## Anforderungen

- Keine globale Freigabe beliebiger Domains in Zertifikatszeilen.
- Ausstellerbezug muss lokal und beidseitig an die konkrete Fundstelle gebunden sein;
  ein beliebiger Credential-Cue irgendwo in derselben Zeile reicht nicht.
- Kunden-/Arbeitgeberbeziehungen in verbreiteten deutschen Nominal-, Verb- und
  Präpositionalformen sicher erkennen. Weitere Sprachen nur entsprechend bereits
  dokumentierter Sprachabdeckung behaupten.
- Mehrzeilige Zertifikatsblöcke sicher behandeln, ohne einen ganzen Abschnitt als
  pauschale Domain-Allowlist zu verwenden.
- Echte Ausstellernamen mit Signalwort-Bestandteilen dürfen nicht allein wegen ihres
  Namens als Kunde gelten.
- Nur synthetische Testdaten verwenden. Keine Runtime-Webabfrage und keine neue
  Rechts- oder Zertifizierungsbehauptung.

## Pflichtprüfungen

- Für alle oben genannten Fälle zuerst Regressionstests ergänzen, die auf RC41 die
  jeweilige Fehlerrichtung reproduzieren.
- Positive und negative Nachbarfälle für Domain, Organisation, E-Mail und URL prüfen.
- TXT/Markdown, CSV-Zelle und DOCX-extrahierten Mehrzeilentext abdecken.
- `node tests/test-credential-catalog.js`
- `node tests/test-pii-regression.js`
- `node tests/test-detector-benchmark.js`
- `npm run test:ci`
- `npm run build:plugin`
- `npm run test:plugin-zip`
- `claude plugin validate plugins/data-secure`
- `git diff --check`

## Abnahme

- Kein reproduzierter Kunden-/Arbeitgeberwert und keine beliebige Kundendomain bleibt
  erhalten.
- Echte Aussteller und Zertifikatstitel bleiben in allen positiven Nachbarfällen
  erhalten.
- Residual-Gate und bestehende Unter-Redaktionsgates werden nicht gelockert.
- Serveränderung erhält die nächste freie RC-Version und ein neu gebautes, geprüftes
  ZIP mit dokumentiertem SHA-256.

Commit und Push nur nach ausdrücklicher Freigabe der ausführenden Sitzung.
