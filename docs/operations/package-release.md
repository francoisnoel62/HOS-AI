# Package release

How `@hos-ai/sdk` and `@hos-ai/cli` reach npm. The release workflow, [`.github/workflows/release.yml`](../../.github/workflows/release.yml), publishes both packages, SDK first, when a tag `packages-v<version>` is pushed. Nobody publishes from a laptop: a release built by GitHub Actions carries its provenance, which links each version to the commit and the workflow that built it.

Both packages share one version, `0.1.0-alpha.N` until HOS 0.1 is final.

## Prepare

1. In a pull request:
   - set the new version in `packages/sdk/package.json`, `packages/cli/package.json`, the CLI's dependency on the SDK and the site's dependency in `package.json`, then the same four places in `package-lock.json`;
   - date each changelog: `## 0.1.0-alpha.2 (2026-10-15)`;
   - add an entry to the site's changelog, `app/changelog/page.tsx`, when the release changes what users can do.
2. Run `node scripts/check-release.ts <version>`: it fails until the versions, the dependency and the changelogs agree.
3. Run `npm run packages:try`, which packs both packages, installs them in an empty project and runs `hos` there.
4. Merge the pull request once the CI passes.

## Release

Tag the merged commit and push the tag:

```sh
git tag packages-v0.1.0-alpha.2 <commit>
git push origin packages-v0.1.0-alpha.2
```

The run waits for a maintainer's approval, which the `npm` environment requires: open it in the Actions tab, then Review deployments. It then checks the versions again, runs the packages' tests and `packages:try`, and publishes.

- **First release of a package.** npm only stages packages that already exist, so the first release publishes directly, with a short-lived token. On npmjs.com, create a granular access token with read and write access to the `@hos-ai` scope, which expires within 7 days, and tick "Bypass two-factor authentication": without it, npm answers 403 to a publish from CI when the account requires 2FA. Store it as `NPM_TOKEN`, a secret of the repository's `npm` environment. Once both packages are published, set up the next point, then delete the token on npmjs.com and the secret on GitHub. If npm no longer offers tokens that bypass 2FA, publish the first version from a maintainer's machine with `npm publish --workspace <package> --access public --otp <code>`, SDK first: that version then has no provenance.
- **Every later release.** On npmjs.com, each package has a trusted publisher: this repository, the workflow `release.yml` and the environment `npm`, allowed to stage only. Under publishing access, it requires two-factor authentication and disallows tokens. Without `NPM_TOKEN`, the workflow stages both packages through OIDC. A maintainer then approves each one in the Staged Packages tab on npmjs.com, or with `npm stage approve <stage-id>`, SDK first, and confirms with two-factor authentication.

## Check

On a machine without the repository, run what the plan asks of a release:

```sh
npx @hos-ai/cli@<version> conformance run arrival-readiness --level normative --impl "python3 impl.py"
```

with `impl.py` from `examples/python-dispositions`, and `py impl.py` on Windows. The workflow [Verify release](../../.github/workflows/verify-release.yml) does this on clean Linux and Windows machines: in the repository's Actions tab, run it with the version. The package pages on npmjs.com show a provenance badge that links to the workflow run.

## If something is wrong

A published version is never replaced: publish a new one. `npm deprecate @hos-ai/cli@<version> "<why>"` warns whoever installs a bad version. npm allows unpublishing only under narrow conditions, such as within 72 hours of the release, and a version number can never be used again: prefer deprecating.
