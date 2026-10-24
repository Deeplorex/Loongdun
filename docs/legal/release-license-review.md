# Windows distribution license review — 2026-09-08

## Scope and evidence

This review covers the current Windows x64 configuration, not an unbuilt macOS distribution. `src/legal/third-party-components.json` records exact versions, original text locations, provenance and SHA-256 digests. It deliberately includes all platform-filtered Cargo nodes, including build/dev support, and the production npm dependency closure. These are conservative coverage sets, not a linker map. Vite, its React plugin and the Tauri CLI are included for generated helpers and installer templates. Development-only test runners, formatters and package managers are not shipped.

`docs/legal/licenses` preserves original LICENSE, COPYING, NOTICE, copyright and related files. Some upstream crates omit their license files; `docs/legal/upstream/index.json` records retrieval from the exact `.cargo_vcs_info.json` commit. Selectors source headers explicitly specify MPL-2.0; the official Mozilla text supplements that crate's omitted file. No third-party source modifications were made. Compilation, bundling, tree shaking and icon selection do not replace the original licensing terms.

## License treatment

- MIT, ISC and BSD copyright and permission/disclaimer texts are retained verbatim, including Lucide's Feather attribution and embedded MIT text.
- Apache texts and supplied NOTICE files are retained. See [Apache 2.0 section 4](https://www.apache.org/licenses/LICENSE-2.0).
- MPL-covered crate source archives are supplied unchanged in `legal/sources` in the installer: cssparser, cssparser-macros, dtoa-short, option-ext and selectors. Their original source and license terms remain available independently of Loongdun's no-sale terms. See [MPL 2.0](https://www.mozilla.org/MPL/2.0/).
- Unicode, BSL, Zlib, Unlicense and other alternatives are retained as supplied, without relabeling all code as MIT. Rust's own standard-library copyright report contains its additional per-file exceptions and third-party notices; it is supplied with the toolchain's license text directory.
- Loongdun's no-sale license applies only to Loongdun-owned work. It does not restrict use, redistribution or modification of third-party components under their own terms.

## Native and installer components

- SQLCipher is **4.14.0**, read from `CIPHER_VERSION_NUMBER` in libsqlite3-sys 0.38.2's shipped amalgamation, not the previously documented 4.18.0. SQLite is 3.51.3. Their BSD notice and SQLite copyright disclaimer are preserved. [SQLite's upstream explanation](https://www.sqlite.org/copyright.html) distinguishes the public-domain deliverable from build scripts.
- Vendored OpenSSL is 3.6.3, verified against VERSION.dat, with its license files and nested component notices collected through openssl-src. The wrapper crate's license alone is not treated as OpenSSL's license.
- Microsoft WebView2 SDK loader 1.0.3650.58 is verified against the DLL version and webview2-com-sys changelog. Both LICENSE.txt and NOTICE.txt come from the matching Microsoft NuGet package. The SDK's third-party information is retained in full. The browser runtime itself is not bundled (`webviewInstallMode: skip`).
- NSIS is 3.11, verified by makensis /VERSION. COPYING includes zlib, bzip2 and CPL terms. The current installer uses LZMA. Its corresponding NSIS v311 source archive (commit 7359413009afd4f0fff472d841fc2f2cc0e0a5f8) is supplied, including compression-module sources, rather than omitting CPL obligations.
- WiX is 3.14.1. Its MS-RL text and corresponding wix3141rtm source archive (commit b40e9a32c24033e11b77baf2c91a704382f898ed) are supplied for installer code/custom actions. WiX build tools are not installed into the application.
- Tauri's NSIS utility plugin is 0.5.3, identified by the Tauri CLI 2.11.4 bundler source. MIT/Apache texts and tagged source (commit 13d9edd27b69310e108d6fbd49f90992f8a05390) are supplied. See the remaining gate below.
- Simple Icons and Lucide supply the external icons; their original licenses are preserved. Brand marks remain their owners' trademarks, without endorsement. The Loongdun mark and application icon are repository product assets, not assigned a third-party license here. No bundled fonts were found; styles use system fonts.

## Remaining release gate — do not claim a complete audit

The prebuilt `nsis_tauri_utils.dll` is pinned by Tauri's downloader, but the tagged upstream source has **no Cargo.lock**. It references windows-sys and semver through version ranges and Rust procedural-macro dependencies. The exact versions compiled into the upstream DLL cannot be established from the source tag or the application's Cargo.lock. Its own license/source is now included, but complete attribution of that binary's internal dependency versions is not independently verified.

Before describing the EXE distribution as fully audited, obtain the upstream build lockfile/SBOM or replace the plugin through a reviewed reproducible build with its own locked dependency inventory and notices. Do not silently substitute the application's versions. This limitation does not mean the plugin is prohibited; it means the evidence is incomplete. The MSI does not use this NSIS plugin, but this document is not an unconditional legal certification of either installer.

Also verify the provenance of product-owned/generated artwork against the publisher's records. This repository audit cannot establish outside ownership records. Re-audit macOS native dependencies before producing a macOS release.

## Maintenance and verification

Run `pnpm legal:collect` on the Windows packaging machine after changing dependencies/resources; review the output and upstream supplemental evidence. Then run `pnpm legal:check`. The collector requires installed dependencies and cached Cargo sources and does not download missing source files automatically. It includes source archives and text hashes; it must not turn an unresolved item into an assumed license.

The checker validates the recorded lock/config digests, original-file digests, source-archive digests and bundle inclusion. The app loads the original text lazily from local bundled data. A passing check is evidence integrity, not resolution of the remaining release gate above. Existing installer files built before this change do not contain the new materials and must not be described as updated.

The additional command pnpm legal:release:check fails on recorded unresolved release gates.
