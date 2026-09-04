# DSGVO / EU AI Act – technische Einordnung

> **Historischer Hintergrund – nicht normativ und keine Rechtsberatung.** Der
> Quellenstand und die Formulierungen dieser Datei sind zeitgebunden. Aktuelle
> Produktzusagen, Sicherheitsgrenzen und Entscheidungspflichten stehen im
> [kanonischen Dokumentenregister](canonical/DOCUMENT_REGISTER.md), im
> [Produktvertrag](canonical/PRODUCT.md) und im
> [aktuellen Iststand](canonical/CURRENT_STATE.md). Diese Datei ist weder
> Konformitätsnachweis noch Rechtsgrundlage.

## Was der Gateway leistet

- lokale Datenminimierung und De-Identifizierung vor Claude
- getrennte Behandlung direkter und indirekter Identifikatoren
- fail-closed Residual-Gate
- lokale visuelle Review-Queue
- Audit-Nachweis ohne Rohinhalt
- kein persistentes Mapping

## Was er nicht leistet

- keine Garantie rechtlicher Anonymität
- keine Rechtsberatung
- keine AI-Act-Konformitätszertifizierung
- keine Freigabe für automatisierte Personalentscheidungen

## Personal-/Bewerberdaten

Der Dokumenttyp allein entscheidet nicht über High-Risk. Entscheidend ist der nachgelagerte Zweck. Beschreibende Kompetenzzusammenfassungen sind anders zu behandeln als KI-gestützte Bewerberfilterung, Kandidatenranking, Leistungsbewertung, Beförderungs-/Kündigungsentscheidungen, Monitoring oder bestimmte Aufgabenzuweisungen.

## Referenzen (Stand 20.08.2026)

- Anthropic/Claude Help Center: Building desktop extensions with MCPB (12.03.2026)
- Anthropic/Claude Help Center: Getting Started with Local MCP Servers on Claude Desktop
- Anthropic/Claude Help Center: When to use desktop and web connectors
- EUR-Lex: Regulation (EU) 2024/1689 (AI Act), Annex III employment
- EDPB: Guidelines 02/2026 on anonymisation (public consultation)

Diese Datei beschreibt technische Designentscheidungen, keine verbindliche Rechtsauslegung.
