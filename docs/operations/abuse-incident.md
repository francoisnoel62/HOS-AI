# Abuse incident

1. Inspect only the short-lived hashed key and expiry in `abuse_keys`.
2. Do not store or export a raw IP address in the submission system.
3. If necessary, lower the local rate limit temporarily and document why outside user payloads.
4. Delete expired rate-limit rows during routine local maintenance.
