# Security issue

1. Stop the affected service if a secret or submission payload may have been exposed.
2. Replace the affected `.env.local` or provider value and reassess whether stored encrypted data can still be read.
3. Remove the exposure from logs or untracked files only after verifying exact paths and recovery needs.
4. Record the remediation without reproducing secrets or payload data.
5. Rotate the relevant provider credential and inspect every affected environment.

## Personal data breach

A breach is any accidental or unlawful destruction, loss, alteration, disclosure of or access to personal data, including form submissions and email addresses.

1. Record every breach in the breach register, even a minor one: date found, what happened, data and people affected, likely consequences and measures taken.
2. Unless the breach is unlikely to put people's rights at risk, notify the data protection authority within 72 hours of becoming aware of it; for a publisher in France, through the [CNIL notification service](https://notifications.cnil.fr/notifications/index). If some facts are not known yet, notify what is known and complete it later.
3. If the risk to people is high, for example readable emails and messages were exposed, tell the people affected without undue delay, in plain language, with what they can do.
4. Ask the provider concerned for its own breach report where the breach happened in its service.

Breach register: **[To complete: where the breach register is kept]**.
