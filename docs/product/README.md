# Loongdun product baseline

Loongdun（龙盾，公司品牌 Deeplorex）is a single-user desktop vault for long-lived, manually maintained credentials and the places that consume them. It answers two questions: “Where is this credential?” and “What will break if I rotate it?”

## Now

- New and edit credential forms include optional searchable credential relationships and product/composition/environment usage locations. Parent credentials live in the same section. Cancel discards drafts; the credential and its relationships save in one database transaction.

- Web accounts, API credentials, servers, databases, recovery credentials, and encrypted key files. Each type provides a concise, fixed standard field set plus optional user-defined fields. Server records use dedicated password-login or SSH-key-login fields rather than storing both credential methods together.
- Usernames used by the asset list and local search are derived from standard username fields rather than entered as duplicate index metadata. Environment metadata applies only to API credentials, servers, and databases.
- The platform field provides an offline, type-specific catalog of common Chinese and international platforms, normalizes recognized aliases, and still accepts custom values.
- Asset rows show Rust-generated masked previews for populated sensitive fields and provide per-field copy actions. Full credential values remain Rust-owned and are copied through the configured expiring clipboard policy.
- An in-app password generator creates random-character passwords inside the credential editor, with configurable rules (length, lowercase/uppercase/digit/symbol sets, look-alike exclusion, at-least-one-per-set) and an entropy estimate. Generation runs in Rust on the operating-system CSPRNG with unbiased sampling; rules persist with vault settings and generated values are never stored as history. Provider-issued secrets such as TOTP seeds or backup codes are typed manually.
- Product → product composition → optional environment modeling with many-to-many credential usage bindings, searchable graph nodes, and an interactive source/destination node inspector. A composition may be a mini-program edition, public account, video series, online store, website, application, or technical service. Separate relationship groups are packed into readable rows rather than stretched across one oversized canvas.
- Directional credential-to-credential relationships record registration, sign-in, recovery, credential issuance, and shared-account links. A credential detail can add either side of the relationship and the graph shows the complete labeled chain.
- Search, nested classification, tags, favorites, trash, expiry metadata, reverse lookup, and a graph view.
- Asset-first desktop workspace: one searchable full-width metadata table with populated core-field previews and a compact on-demand detail dialog.
- Local platform identity system with a Loongdun mark, bundled brand logos for common websites/clouds/databases, and category-icon fallbacks.
- Master-password encryption, one-time recovery key, optional OS quick unlock, automatic lock, configurable per-field reveal expiry, and clipboard clearing.
- On Windows, Hello verification is an operating-system dialog owned by and foregrounded over the active Loongdun window. Quick unlock requests verification once on startup. Relocking after inactivity, hiding the window or pressing Lock stays silent until the user chooses Windows Hello.
- Encrypted backup and cold migration between Windows and macOS. Automatic backups default to daily while the app is open and the vault is unlocked, with hourly/weekly/off settings and a local destination. Overdue backups run on the next unlock; no additional service is installed. Historical backups are retained until manually removed.
- System, light, and dark themes with a saved Chinese, English, or system-language interface setting.
- Built-in Chinese and English privacy policy, terms of use, and third-party open-source license inventory. Original third-party license texts can be viewed offline on demand. Native bundles include the legal documents, transitive notices, original texts and relevant source archives; outstanding evidence gates are recorded in docs/legal/release-license-review.md.

## Invariants

- Personal and single-user only. No member, role, invite, ownership, or collaboration model.
- Offline at runtime. No cloud sync, remote fonts/scripts, telemetry, updater, HTTP client, or browser autofill.
- Credential values are masked by default, never logged, and never persisted in frontend state.
- Asset-list responses may contain non-sensitive core values and irreversible masked previews, but never full values from fields marked sensitive.
- Only long-lived human-maintained credentials are assets. Sessions, cookies, current TOTP codes, JWTs, STS credentials, and one-job tokens are out of scope.
- Backups are encrypted. There is no plaintext or passwordless export.
- Deletion is recoverable through trash until a separately confirmed permanent purge.
- Legal documents must describe the shipped behavior. A public release must identify the actual publisher and a working contact method; the app must not invent or silently retain placeholder publisher details.

## Core entities

- `Asset`: common metadata plus a versioned payload and optional parent asset.
- `Attachment`: encrypted key/certificate bytes and verifiable metadata.
- `Project`, product composition, and `Environment`: the places that use credentials. The internal `Service` record remains the compatibility name for a product composition.
- `UsageBinding`: a credential-to-consumer relation with purpose, config key, environment, notes, and verification time.
- `AssetRelation`: a typed, directional credential-to-credential relation with an optional note.
- `Folder`, `Tag`: personal organization.

## Success criteria

A user can create each asset kind, attach a key file, find it by metadata, map it to products and environments, inspect impact before rotation, lock the vault, and restore the encrypted vault on another device with either a password or recovery key.
