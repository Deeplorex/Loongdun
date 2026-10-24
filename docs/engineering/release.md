# Native release

## Windows-first unsigned package

1. Replace the publisher/contact fallback in the legal documents with the actual publisher identity and a working support or privacy contact shown on the official download page.
2. Review the privacy policy against the shipped data flow. If networking, diagnostics, crash reporting, update checks, payment, or cloud features exist, document their exact behavior before release.
3. Run `pnpm legal:check`, generate a complete transitive dependency notice bundle, and verify that required license texts and copyright notices are present in the installer resources.
4. Run `pnpm quality:full` and resolve material findings.
5. Create and restore an encrypted backup using a fresh target directory.
6. Run `pnpm tauri build --target x86_64-pc-windows-msvc`.
7. Install, start, open all three legal pages, lock, unlock, and uninstall the generated unsigned package.
8. Label the artifact as unsigned; do not bypass Windows security policy programmatically.

ARM64 additionally requires the Rust target and matching MSVC tools. macOS packaging, Touch ID, universal binaries, signing, and notarization must run and be verified on a native Mac. No automatic updater is included.

## Current 0.1.0 verification

- `pnpm quality`: passed on 2026-09-02.
- Native debug application build: passed.
- Windows x64 unsigned NSIS package: passed; generated as `Rhizome 密钥库_0.1.0_x64-setup.exe` at the 2026-09-02 verification (product renamed to `Loongdun` afterwards; artifacts now generate as `Loongdun_0.1.0_x64-setup.exe`).
- JavaScript production advisory scan: no known vulnerabilities.
- RustSec advisory scan: tooling installed, but database retrieval was blocked by workstation-to-GitHub connectivity and must be rerun when available.
- Windows ARM64 package: blocked until the optional MSVC ARM64/ARM64EC build-tools component is installed with an interactive UAC confirmation.
