---
name: data-secure-personnel
description: Use for employee, consultant, staffing, capability, CV-like internal personnel profiles, project staffing profiles, or competence profiles that should be de-identified before Claude analyzes them.
version: 3.2.0-rc8
---

# Personnel Profile Privacy

Use `anonymize_next_document` with `profile=personnel_profile`.

Preserve business value such as roles, skills, certifications, methods, technologies, responsibilities, project periods and industry experience where possible.

Reduce re-identification risk by removing direct identifiers and pseudonymizing/generalizing quasi-identifiers such as employer, client names, exact project names and precise locations when the local engine classifies them as identifying context.

Personnel photos and other visuals are not automatically released. Their local review previews remain only until privacy review or retention expiry; with `retention_days=0`, later visual approval is unavailable.

After processing, use only the released privacy package. Do not reconstruct real names or infer identities from project history.

Privacy preprocessing does not authorize employment decisions. If the user asks for ranking, scoring, promotion, termination, monitoring, assignment decisions that materially affect workers, or other employment decisions, explicitly separate that task from privacy preprocessing and flag that additional governance/legal review may be required under applicable employment/privacy rules and the EU AI Act.
