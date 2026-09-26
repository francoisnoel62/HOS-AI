# Privacy rights request

Covers every request made under the [privacy notice](../../app/privacy/page.tsx): access, correction, deletion, restriction, portability and objection. Answer within one month of receipt; the GDPR allows two more months for complex requests, if you tell the requester why within the first month.

1. Record the date received and the right requested, outside the submission record and without copying payload data.
2. Verify, in a proportionate way, that the requester controls the email address used in the form: a reply from that address is usually enough. Ask for nothing more than needed.
3. Locate the submission by decrypting email only in an authorised environment.
4. Act on the request:
   - **Access or portability**: send the decrypted fields of the submission, the dates and status, in a readable format such as JSON or plain text.
   - **Correction**: update the encrypted payload and record a minimal `status_changed` event.
   - **Deletion**: delete the `submissions` record; its `submission_events` cascade. Remove matching outbox or email-provider copies where the provider allows it.
   - **Restriction**: move the record to `closed`, stop contact, and keep it only for the period of the restriction.
   - **Objection**: stop the processing and delete the record unless a compelling legitimate reason is documented.
5. Reply to the requester, saying what was done. If you refuse, give the reason and mention the right to complain to a data protection authority.
6. Keep only the fact of completion (date, right, outcome) if a lawful record is needed.

Do not retain raw request emails, encrypted payloads or technical rate-limit evidence beyond their purpose.
