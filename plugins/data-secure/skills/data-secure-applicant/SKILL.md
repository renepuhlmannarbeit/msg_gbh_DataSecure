---
name: data-secure-applicant
description: Use for job applications, CVs, resumes, candidate profiles, cover letters, or applicant documents that should be privacy-processed locally before Claude analyzes them.
version: 3.2.0-rc4
---

# Applicant Privacy

Use `anonymize_next_document` with `profile=applicant`.

Applicant visuals are withheld by default. Keep useful qualifications, experience, skills, certifications and role history while removing direct identifiers and other identifying details according to the local privacy gate.

After processing, use only released package data. Do not infer or reconstruct the candidate's identity from the remaining career history.

Keep the privacy workflow descriptive. Do not treat DataSecure as authorization for automated candidate ranking, scoring, filtering, rejection, selection or hiring recommendations. If the user requests those functions, state that the downstream recruiting use is separate from anonymization and may require additional high-risk employment governance under the EU AI Act and applicable employment/privacy law.
