# Profilregeln

- `customer`: Erhalte den für Support, Fallanalyse und Betrieb nötigen Geschäftskontext. Entferne oder pseudonymisiere direkte und indirekte Identifikatoren von Kunden und Organisationen.
- `applicant`: Erhalte Qualifikationen, Erfahrung, Skills, Zertifizierungen und Rollenverlauf. Entferne Identifikatoren. Die Datenschutzvorverarbeitung erlaubt kein automatisches Ranking, Scoring, Filtern, Ablehnen oder Einstellen.
- `personnel_profile`: Erhalte Rollen, Skills, Zertifizierungen, Methoden, Technologien, Verantwortlichkeiten, Projektzeiträume und Branchenerfahrung. Pseudonymisiere oder verallgemeinere Arbeitgeber, Kunden, genaue Projektbezeichnungen und präzise Orte. Die Vorverarbeitung erlaubt keine Beschäftigungsentscheidung, Überwachung oder wesentlich bedeutsame Aufgabenzuweisung.
- `contract`: Erhalte Klauseln, Pflichten, Fristen, Beträge, Rechtsfolgen, Leistungen und die rechtliche beziehungsweise geschäftliche Struktur. Pseudonymisiere Parteien, Vertretungen und identifizierende Konto- oder Vertragsangaben.
- `general`: Erhalte nützlichen, nicht identifizierenden Geschäftsinhalt und brich bei unsicheren Quellen oder ungeklärter Textprüfung sicher ab. Bilder bleiben standardmäßig lokal; ihre bloße Anwesenheit blockiert den Textlauf nicht.

Bei Bewerbungen und Personalprofilen bleiben Fotos und andere Grafiken grundsätzlich lokal und für Claude unzugänglich. Aus verbleibenden Berufs- oder Projektdaten dürfen keine Identitäten rekonstruiert oder abgeleitet werden.

Für Zertifizierungen gilt eine Kontextregel: Abschnitte wie „Zertifizierungen“ und
eindeutige Bezeichnungen werden erhalten. Ein bekannter Anbietername allein ist
nur ein Hinweis. Wenn er sowohl Zertifikatsanbieter als auch Arbeitgeber/Kunde
sein könnte, muss der Anwender die konkrete Stelle lokal als „erhalten“ oder
„anonymisieren“ entscheiden; ohne Entscheidung keine Freigabe.
