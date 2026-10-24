# Open-source compliance

Loongdun records the Windows production npm closure, platform-filtered Cargo graph and separately audited native/installer resources in `src/legal/third-party-components.json`. Build support is labelled separately. Original texts are preserved in `docs/legal/licenses` and available offline in the application; required source archives are included in `docs/legal/sources`. See `release-license-review.md` for evidence and unresolved release gates. `THIRD-PARTY-NOTICES.md` and these directories are configured as native bundle resources.

For every dependency change:

1. Confirm the exact locked version, SPDX license expression, upstream project, copyright notice, and redistribution conditions.
2. Update `src/legal/third-party-components.json` and `THIRD-PARTY-NOTICES.md` in the same change.
3. Preserve any required license text, copyright notice, attribution, source offer, or modification notice in the release artifact.
4. Do not add copyleft, source-available, non-commercial, or custom-licensed runtime code without a release-specific legal review.
5. Run `pnpm legal:collect` and review the generated inventory, then `pnpm legal:check` before packaging. The checker verifies evidence and lock/config digests; it does not resolve the release gates documented in the review.

Platform names and logos are identifiers for user-entered services. Their trademarks remain with their owners and their presence does not imply affiliation or endorsement.
