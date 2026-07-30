# Delivery failure

1. Confirm the database transaction succeeded before attempting any delivery retry.
2. Inspect the local outbox path and write permission without exposing a submission payload.
3. Retry a safe local outbox write once.
4. If it fails again, create a minimal internal `delivery_failed` event and notify the local operator.
5. Do not lose or duplicate the submission merely because an acknowledgement cannot be written.
