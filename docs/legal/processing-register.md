# Record of processing activities

GDPR Article 30. Kept up to date with the [privacy notice](../../app/privacy/page.tsx) and [`lib/legal.ts`](../../lib/legal.ts); review both together.

| Field | Value |
| :-- | :-- |
| Controller | [To complete: publisher's legal name and address] |
| Contact | [To complete: privacy contact email] |
| Data protection officer | None appointed |
| Last reviewed | 2026-09-26 |

## 1. Participation and contact forms

| Field | Value |
| :-- | :-- |
| Purpose | Assess and answer founding member, pilot, technical contributor, financial patron and general inquiries |
| Legal basis | Art. 6(1)(b) steps at the person's request before an agreement; Art. 6(1)(f) legitimate interest for general inquiries |
| People concerned | Professional contacts of operators, software providers, integrators, developers and supporters |
| Data | Name, professional email, organisation, country, role, form-specific answers, free-text message, optional GitHub handle or organisation website |
| Sensitive data | None requested; the forms ask people not to send guest data, credentials or confidential information |
| Recipients | People who review submissions; processors below |
| Retention | 12 months after the last exchange (`retention_due_at`), deleted by the daily purge |
| Security | AES-256-GCM encryption of payload and email; metadata stored separately; HTTPS; access limited to reviewers |

## 2. Abuse prevention

| Field | Value |
| :-- | :-- |
| Purpose | Rate-limit form submissions and block bots |
| Legal basis | Art. 6(1)(f) legitimate interest in securing the forms |
| Data | Salted SHA-256 hash of IP address and user agent; IP address and browser signals sent to Cloudflare Turnstile |
| Retention | Rate-limit window (1 hour by default), then deleted by the daily purge |

## 3. Hosting logs

| Field | Value |
| :-- | :-- |
| Purpose | Deliver and secure the website |
| Legal basis | Art. 6(1)(f) legitimate interest |
| Data | IP address, user agent, requested path, date and time |
| Retention | [To complete: Vercel log retention for the selected plan] |

## Processors

| Processor | Role | Location | Transfer safeguard | Data processing agreement |
| :-- | :-- | :-- | :-- | :-- |
| Vercel Inc. | Hosting, form handler, logs | United States | EU-U.S. Data Privacy Framework | [To complete: DPA accepted on (date)] |
| [To complete: database provider] | Encrypted submissions, rate-limit keys | [To complete] | [To complete] | [To complete] |
| [To complete: email provider] | Acknowledgement and notification emails | [To complete] | [To complete] | [To complete] |
| Cloudflare, Inc. | Turnstile bot protection | United States | EU-U.S. Data Privacy Framework | [To complete: DPA accepted on (date)] |

## Related procedures

- [Privacy rights request](../operations/rights-request.md)
- [Security issue and personal data breach](../operations/security-issue.md)
- [Submission review](../operations/submission-review.md)
