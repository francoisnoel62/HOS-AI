# Local security issue

1. Stop the local service if a secret or submission payload may have been exposed.
2. Replace the affected local `.env.local` value and reassess whether stored encrypted data can still be read.
3. Remove the exposure from logs or untracked files only after verifying exact paths and recovery needs.
4. Record the remediation without reproducing secrets or payload data.
5. Before a future deployment, rotate the relevant provider credential and inspect affected environments.
