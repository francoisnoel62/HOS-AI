# Submission review

1. Open the local Postgres record only from an authorised local environment.
2. Move `status` from `received` to `under_review`; insert a minimal `status_changed` event with an internal actor identifier.
3. Read only the fields needed to qualify the path. Do not copy payloads into unprotected notes or chat tools.
4. If contact is appropriate, update `last_contact_at`, move to `contacted` and record the status change.
5. If it is not appropriate, move to `closed`; do not retain free-text detail beyond the encrypted source record.

The local outbox is evidence that messages would have been issued; it is not a mail delivery ledger.
