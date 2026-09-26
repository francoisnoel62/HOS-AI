# Local content release

1. Edit content in a branch or local working tree.
2. Run typecheck, lint, unit tests, browser checks and link checks.
3. Check that status labels, public claims and external links are factual.
4. Run `npm run legal:check`: it fails while a publisher detail in `lib/legal.ts` is still marked "To complete". When a change alters what is collected, who processes it or for how long, update the privacy notice and `privacyVersion` in the same change.
5. Review the local site at desktop and mobile widths, in both themes.
6. The founder decides whether and when content becomes public; no local action deploys it.
