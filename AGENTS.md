# Loongdun engineering rules

- `docs/product/README.md` is the product authority; `.project/standard-project.json` is the architecture authority.
- Preserve the single-user, offline-only, encrypted-local-vault boundary. Do not add cloud sync, telemetry, remote assets, browser autofill, servers, workers, queues, or team features without explicit approval.
- Rust owns secrets, persistence, cryptography, backup, clipboard, and platform integration. The React bundle must never contain database access, vault keys, or persistent secret state.
- Every behavior change updates `docs/changes.md` and a directly affected test. Bugs require a regression test.
- Use migrations for schema changes. Never log secret payloads or use real credentials in fixtures.
- Run the narrowest affected test during routine work. Run `pnpm quality` once for initialization or a release boundary.
- Do not stage, commit, push, sign, publish, or deploy without explicit authorization.

## Third-party license maintenance

- Whenever adding, upgrading, replacing or removing a third-party dependency or bundled resource, update its legal inventory and notices in the same change. Include shipped transitive dependencies, native libraries, copied code, icons, fonts and other assets, not only direct dependencies.
- Maintain `src/legal/third-party-components.json` and `THIRD-PARTY-NOTICES.md` together: record the actual shipped version, upstream source, license identifier and required attribution. Review upstream LICENSE/NOTICE files for that version; do not infer licensing from the package name or previous version.
- Preserve third-party copyright, license texts, NOTICE files and required modification notices. Bundle required texts with the app and keep third-party notices accessible offline. Loongdun's no-sale license applies only to Loongdun-owned material and must not restrict third-party license rights.
- Review changed license obligations against intended distribution before introducing the component. If terms are missing, unclear or incompatible, report the blocker and obtain direction; never silently assume permission or claim compliance.
- Run `pnpm legal:check` after dependency/resource changes and update `docs/changes.md`. The current checker covers direct runtime inventory entries, not complete transitive/resource licensing or all obligations; passing is not a complete compliance audit.
- Before release, review shipped dependencies/resources and bundled license texts, including transitive and native components. Do not claim complete compliance while known omissions remain. Review development-only tools for applicable obligations and document them if their code/resources enter the distributed app.
