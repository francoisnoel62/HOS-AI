# Deletion request

1. Verify that the requester controls the professional email address in a proportionate way.
2. Locate the submission by decrypting email only in the authorised local environment.
3. Delete the `submissions` record. Its `submission_events` cascade automatically.
4. Remove matching local-outbox files if they are still present and no legal preservation reason applies.
5. Record the fact of completion outside the deleted record only if a lawful operational record is needed.

Do not retain raw request emails, encrypted payloads or technical rate-limit evidence beyond their purpose.
