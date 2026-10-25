# Product changes

## 2026-10-25 — 侧边栏分区标题动作按钮恢复紧凑样式

- Type: `bug`
- 侧边栏「文件夹」「产品」分区标题行的动作按钮（新建文件夹 / 查看所有产品）被通用导航按钮规则 `.sidebar nav button` 劫持（选择器优先级 0,1,2 高于 `.label-action` 的 0,1,0）：按钮被拉伸为整行宽、最小高度 38px、套用三列网格与行级悬停背景，导致图标紧贴标题文字、整行可点击且悬停高亮，与其他分区纯文本标题的行为样式不一致。
- 修复沿用 `.sidebar nav .folder-delete` 的既有覆盖模式：新增 `.sidebar nav .label-action`（恢复 22×22、单列网格、muted 前景色、零内边距）与 `.sidebar nav .label-action:hover`（仅前景变色、清除行级悬停背景）。标题行恢复为「标签居左、22px 动作图标贴右缘、仅图标可交互」的紧凑形态，与其他分区标题一致。纯 CSS 层叠修复，组件结构与逻辑无变化。
- Tests: `src/components/Sidebar.test.tsx` 保障两个标题行入口的渲染与回调；本修复为纯样式层叠问题，jsdom 不计算外部 CSS 级联，无新增断言，修复经浏览器实测验证（按钮 22×22 贴右缘、行中部悬停无高亮）。

## 2026-10-24 — 凭证到期应用内提醒

- Type: `requirement`
- 凭证临近到期时在应用内提醒（不使用系统级通知，维持离线边界）：① 侧边栏「凭证库」区在星标收藏下方新增「即将过期」入口，带数量角标（已过期 + 提前窗口内的凭证数），点击进入按到期日升序的过滤视图；② 解锁凭证库且索引加载完成后，若存在此类凭证弹一次轻提示「提醒：{count} 个凭证已过期或即将到期」，每次解锁至多一次（锁定后重置），避免随日常操作重复打扰；③ 凭证列表卡片到期行显示状态——已过期（红）「已过期 {days} 天」、当天「今天到期」、窗口内（橙）「{days} 天后到期」，悬停可见完整日期，未设到期时间仍显示「长期有效」。
- 提前提醒窗口可配置：设置对话框新增「到期提醒」区（提前提醒：关闭 / 1 / 3 / 7 / 14 / 30 天，默认 7 天），存为库设置 `expiry_reminder_days`（Rust `VaultSettings` 带 serde default，旧 settings.json 兼容；`save_settings` 按允许值列表校验）。窗口关闭(0)时仅停用提前提醒，已过期凭证仍始终计入提醒与角标。
- 实现：到期判定为纯前端计算（新增 `src/lib/expiry.ts`：本地时区今日、日期加减、单凭证状态与集合收集），复用解锁后已加载的全量索引 `assetsIndex`，无新 Tauri 命令、无 schema 变更、无新第三方依赖；「即将过期」视图在 `loadVisible` 既有客户端过滤链上追加；「今天」状态每小时轻量刷新，覆盖应用跨天不关机的场景。即将过期视图空态显示「没有已过期或即将到期的凭证」。
- 边界：附件密码的 `expires_at` 不在本次提醒范围；不引入 tauri-plugin-notification；`?demo` 演示模式设置默认值同步为 7 天。
- Tests: `src/lib/expiry.test.ts` 覆盖今日到期/窗口边界/已过期/回收站排除/窗口关闭；`src/components/Sidebar.test.tsx` 覆盖「即将过期」入口渲染、角标计数、active 态与导航回调；`src/components/SettingsDialog.test.tsx` 覆盖提醒窗口选择与关闭保存；`src/App.test.tsx` 覆盖解锁后一次性提醒、自动清除与重新解锁后再次提醒；`src-tauri/src/vault.rs` 覆盖 `expiry_reminder_days` 越界拒绝与持久化。

## 2026-10-24 — 品牌重塑为 Loongdun（龙盾 / Deeplorex）

- Type: `requirement`
- 产品英文正式名改为中文拼音 "Loongdun"，公司品牌为 Deeplorex，产品名与公司名两级目录化：`productName` 改为 `Loongdun`（卸载键、快捷方式、dmg 内 `.app` 名称随之更新），`identifier` 改为 `com.deeplorex.loongdun`（配置目录与 WebView 数据目录随之迁移），新增 `bundle.publisher: Deeplorex`（安装注册表发布者与 `Software\Deeplorex` 键名），主程序二进制由 `rhizome.exe` 改为 `loongdun.exe`（Cargo 包与 lib 同步改名，`package.json` 名改为 `loongdun-vault`）。中文系统仍按既有规则显示“龙盾”（安装钩子与运行期 `branding.rs` 同口径，`DEFAULT_APP_NAME` 由 "Rhizome" 改为 "Loongdun"）。
- 安装目录：NSIS 默认安装位置由官方模板的 `%LOCALAPPDATA%\{productName}` 一级目录改为 `%LOCALAPPDATA%\Deeplorex\Loongdun`。因 Tauri 2.11 的 NSIS 配置不支持自定义安装目录，内置了基于官方 2.11.4 模板的自定义模板 `src-tauri/installer-template.nsi`（仅改 `.onInit` 默认目录派生行为 `BRAND_INSTALL_DIR`，经 `bundle.windows.nsis.template` 引用）：目录页展示值、静默安装与实际落盘完全一致。用户自定义位置与同品牌升级时注册表恢复的上次位置不受影响。**升级 @tauri-apps/cli 时需对照官方模板重新同步该文件**（文件头有说明）。
- 数据目录默认位置由 `{用户文档}/RhizomeVault` 改为 `{用户文档}/Deeplorex/Loongdun`（`vault.rs` 的 `default_vault_dir_under`），创建/恢复凭证库的默认建议位置与 `VaultStatus.defaultVaultPath` 下发值随之更新。
- 旧版本自动迁移（`src-tauri/src/migration.rs`，启动期、构建 AppState 前执行，尽力而为且不删除用户数据）：① 标识符变更后新配置目录缺少 `app-state.json` 而旧目录 `app.rhizome.vault` 存在时，复制定位文件（旧文件保留，可回滚）；② 定位文件指向旧默认库 `{文档}/RhizomeVault`（或定位文件丢失但旧默认库存在且含密钥信封）而新默认位置不存在时，整目录改名为新位置并改写定位文件；自定义库路径、新位置已存在、目录被占用改名失败等情形一律保持原状继续可用。安装层面：安装器检测旧「Rhizome 密钥库」卸载项并静默运行其卸载器、兜底清理旧默认安装目录/卸载键/指向旧目录的快捷方式，避免升级后出现两份安装。
- 文件与文案：备份文件扩展名改为 `.loongdun-backup`（自动备份命名为 `loongdun-auto-…`，导出默认名 `loongdun-日期.loongdun-backup`；导入对话框同时接受旧 `.rhizome-backup`，旧备份仍可恢复，恢复逻辑与扩展名无关）；界面 i18n 中文文案的产品名统一为“龙盾”、英文为 "Loongdun"（`i18n.tsx` 键与映射、法律对话框、门页介绍、`index.html` 标题与描述）；语言偏好 localStorage 键由 `rhizome-language` 改为 `loongdun-language`（标识符变更后 WebView 存储本就重置，无额外损失）；运行期错误与 Windows Hello 提示中的品牌词统一经 `branding::current_app_display_name()` 取当前语言显示名，不再硬编码。
- 许可证更名：`Rhizome No-Sale License 1.0` 更名为 `Loongdun No-Sale License 1.0`（中文名 `Loongdun 禁止销售许可 1.0`），LICENSE 本体、双语协议/隐私政策、README、`legal-check` 校验串与 `collect-licenses` 通知模板同步；条款实质不变，仅更名权利人称谓（中文条款用“龙盾（Loongdun）”、英文条款用 Loongdun）。加密域分离常量（`crypto.rs` 信封 AAD）由 `rhizome-vault-key-envelope-v1` 改为 `loongdun-vault-key-envelope-v1`：新写入的信封一律用新域，解密失败时自动回退旧品牌域（旧库/旧备份照常打开），旧信封在用户修改主密码或轮换恢复密钥重包时自然迁移到新域。`THIRD-PARTY-NOTICES.md`、`AGENTS.md`、`.project/standard-project.json` 等工程文档的项目称谓同步改为 Loongdun。法律清单 `inputs` 摘要按新配置手工刷新（tauri.conf.json、Cargo.toml、Cargo.lock、package.json），未运行 `legal:collect`（避免覆盖手工标注）。
- 边界：MSI（WiX）目标随 `productName` 默认安装到 `Program Files\Loongdun`（无公司前缀），WiX 升级码变化导致旧 MSI 需手动卸载；macOS `.app` 为 `Loongdun.app`；Rhizome-Ark 鸿蒙移植版（独立沙盒数据目录与 bundle 名）按决定不改；GitHub 仓库已更名为 `Deeplorex/Loongdun`（README 克隆地址同步），codeup 组织内路径沿用原名。
- Tests: `src-tauri/src/migration.rs` 覆盖定位文件复制、旧默认库整目录迁移、自定义位置不动、新位置已存在不覆盖、无库标记目录不接管、定位文件缺失接管、新定位文件优先七种情形；`crypto.rs` 覆盖旧品牌域信封可解锁且新域信封照常工作；`branding.rs` 覆盖当前语言显示名一致性；`backup.rs` 保留旧扩展名备份恢复夹具并新增新扩展名夹具；前端 `Brand.test.tsx`（英文显示 Loongdun）、`App.test.tsx`/`VaultGate.test.tsx`（新默认路径 `Documents\Deeplorex\Loongdun`）、`SettingsDialog.test.tsx`（新导出默认名与双重扩展名过滤器）、`LegalDialog.test.tsx`（新许可证名称）同步更新。NSIS 安装脚本经缓存 makensis 离线编译验证，并完成 `Loongdun_0.1.0_x64-setup.exe` 全量构建。

## 2026-10-24 — 详情面板直接切换凭证星标

- Type: `requirement`
- 凭证详情面板头部新增星标按钮（与产品面板的星标交互一致）：点击即加入/取消星标收藏，无需先进入编辑器；按钮带 `aria-pressed` 状态，已星标时图标填充并以“取消凭证星标”播报，操作后有轻提示。原头部只读的静态星标展示移除，由该按钮同时承担状态展示。
- 保存链路：星标切换在 Rust `save_asset` 之上走“取完整编辑输入 → 翻转 `favorite` → 整行保存”的路径（`src/App.tsx` 的 `toggleAssetFavorite`），避免用列表摘要直接保存导致字段被整行 UPDATE 清空；不触碰凭证关联与关系数据。后端无改动，`?demo` 模式经 `demoApi` 同样支持。
- Tests: `src/components/DetailPanel.test.tsx` 覆盖星标/取消星标的按钮状态与回调；`src/App.test.tsx` 覆盖完整输入往返保存（断言 `getAssetForEdit` 取全量输入、`saveAsset` 收到翻转后的 `favorite` 与原字段）与成功提示。

## 2026-10-24 — 默认库位置改到各系统用户目录

- Type: `requirement`
- 首次创建或恢复凭证库时的默认保存位置不再硬编码 `D:\RhizomeVault`（盘符根目录），改为各系统用户目录下的常见位置：Windows 与 macOS 为「文档 / Documents」目录下的 `RhizomeVault`（Windows 经系统 Known Folder 解析，跟随用户对该目录的重定向），Linux 优先 XDG 文档目录，未定义时回退用户主目录。
- 默认位置由 Rust 侧解析（`src-tauri/src/platform.rs` 的 `default_vault_base_dir`、`vault.rs` 的 `default_vault_dir`），经 `VaultStatus.defaultVaultPath` 下发；`VaultGate` 只回填展示，用户仍可直接输入或用目录选择器自定义，自定义能力与现有「记忆上次路径」（`app-state.json`）行为不变，已有库位置不受影响。
- 说明：若「文档」目录被系统重定向到云同步盘（如 OneDrive），库文件会随系统同步；库内数据库与密钥信封均为静态加密，且用户可随时把保存位置改到任意本地目录。
- Tests: `src/components/VaultGate.test.tsx` 覆盖默认路径回填与自定义路径创建；`src/App.test.tsx` 覆盖未初始化态展示后端默认位置；`src-tauri/src/vault.rs` 覆盖未初始化状态携带平台默认目录、初始化仍使用用户指定目录。

## 2026-10-23 — 中文系统安装后程序名显示“龙盾”

- Type: `requirement`
- Windows NSIS 安装器在系统界面语言为中文（简/繁/港/新/澳任意变体，按 `GetUserDefaultUILanguage` 主语言 ID 判定）时，开始菜单与桌面快捷方式以及“应用和功能”卸载项显示“龙盾”，开始菜单搜索“龙盾”即可找到本程序；其他语言保持现有名称。
- 实现方式：`src-tauri/installer-hooks.nsh`（经 `bundle.windows.nsis.installerHooks` 引用）在安装后把模板创建的快捷方式重命名为“龙盾”（重命名保留目标与 AppUserModelID），覆写卸载注册表 `DisplayName` 值；交互安装的桌面快捷方式因由完成页在安装段之后创建，统一在 `.onGUIEnd` 收尾换名，静默安装在钩子内直接处理；卸载时同步取消固定并删除“龙盾”快捷方式（`/UPDATE` 模式与模板一致保留）。
- 边界：安装目录与卸载注册表键路径仍由 `productName`「Rhizome 密钥库」派生，安装路径不受影响；MSI/dmg 目标、应用标识符与法律文本中的 "Rhizome" 命名不变。
- 运行期同一条件下（`src-tauri/src/branding.rs`）：主窗口标题、托盘提示与托盘菜单显示“龙盾”，界面品牌词牌在中文界面显示“龙盾”、英文界面显示 "Rhizome"（`src/components/Brand.tsx`）。未新增第三方依赖（Win32 语言 API 经直接声明调用，与 NSIS 侧使用同一 API 保持判定口径一致），仅刷新 `src-tauri/tauri.conf.json` 在法律清单中的证据摘要（依赖版本与许可元数据未变）。
- Tests: `src-tauri/src/branding.rs` 覆盖各中文变体与其他语言的名称映射；`src/components/Brand.test.tsx` 覆盖中英文词牌显示。

## 2026-10-12 — In-app password generator with security-first rules

- Type: `requirement`
- The credential editor now offers a password generator on user-chosen secret fields (website/database login passwords, server key passphrases, file passphrases, and sensitive custom fields); provider-issued secrets such as TOTP seeds, backup codes, and API keys stay manually typed.
- Rules are configurable in the generator panel: length 8–128, lowercase/uppercase/digit/symbol sets, look-alike character exclusion (l, 1, I, 0, O, o), and at-least-one-character-per-set; an entropy estimate with strength wording is shown for the current preview.
- Generation lives in Rust (`src-tauri/src/generator.rs`) on the existing `getrandom` operating-system CSPRNG with byte-level rejection sampling (no modulo bias) and whole-password resampling for the per-set guarantee; internal buffers are zeroized and nothing is logged or stored as history. Exposed as the session-independent `generate_password` IPC command; no new dependencies.
- Last-used rules persist in vault settings (`passwordGenerator` in `settings.json`, serde default, no migration) and are revalidated by `save_settings`; the `?demo` dev mode mirrors the same rules with WebCrypto.
- Tests: `src-tauri/src/generator.rs` covers rule compliance, ambiguous exclusion, invalid-rule rejection, entropy math and sample distinctness; `src-tauri/src/vault.rs` covers settings validation; `src/components/PasswordGeneratorPanel.test.tsx` covers generation on open, rule-change regeneration, apply-and-persist, persistence failure and the empty-charset guard; `src/components/AssetEditor.test.tsx` covers field scoping and fill-and-save.

## 2026-10-08 — Install a blocking commit quality gate

- Type: `maintenance`
- Install the versioned pre-commit hook during dependency setup, with an explicit installer for existing checkouts; preserve custom hook configurations.
- Block commits on frontend/Rust check failures, missing tools or tracked unstaged edits. Include contract, legal and change-record checks without release packaging or network audits. No third-party dependencies added.
- Refresh the package-manifest evidence digest after verifying that dependency versions and license metadata are unchanged.
- Tests: `scripts/pre-commit.node-test.mjs` covers success, failures, unavailable tools, unstaged edits, repeat installation and custom hook preservation.

## 2026-10-08 — Platform logos use platform identity rather than login accounts

- Type: `bugfix`
- Prioritize the platform field, then the title, then non-sensitive database-engine, cloud-provider and login-URL fields. Exclude usernames, email addresses, arbitrary field labels and sensitive fields from brand detection.
- Match English aliases at token boundaries and domain aliases at domain boundaries so unrelated names and domains ending in `x.com` no longer appear as X. Recognize the exact platform name X.
- Add bundled Figma and Xiaohongshu marks from the existing Simple Icons 16.29.0 dependency and record their provenance in the legal inventory and notices; no dependency version changes.
- Tests: `src/components/PlatformLogo.test.tsx` covers email interference, source precedence, alias boundaries, safe field fallbacks and rendered brand icons.

## 2026-09-21 — Quality gate excludes the HarmonyOS submodule

- Type: `maintenance`
- Biome formatting/linting and vitest test discovery now skip `Rhizome-Ark`, a separate nested repository with its own build toolchain; its hvigor build caches and bundled hypium files broke the root `pnpm quality` format check and test run after the submodule was added.
- Verified with the full `corepack pnpm quality` run. Contributor tooling only; no application behavior changes.

## 2026-09-16 — Main window starts maximized

- Type: `requirement`
- The main window now opens maximized on launch instead of a fixed 1440×920 centered frame; the configured size and centering remain as the restore size.
- Tests: `scripts/smoke-check.mjs`.

## 2026-09-15 — Settings hint text matches the muted hint style

- Type: `bugfix`
- Supplementary paragraphs inside settings sections (backup schedule/retention notes, tray note) had no styling and rendered as large dark body text, clashing with the small muted hints used in section headers. They now share the muted 9px hint style.
- Tests: `src/components/SettingsDialog.test.tsx`.

## 2026-09-15 — Backup section matches other settings and its folder is pickable

- Type: `bugfix`
- The encrypted-backup section used an undefined `settings-grid` class, so it fell back to browser default layout and looked unlike the other settings sections; it now uses the shared two-column form grid.
- The backup directory read-only field was inert: it looked interactive but could not be clicked. The field and its inline folder button now open the native folder picker directly; the separate “选择备份目录” button is removed. The default folder, export and recovery-key actions stay.
- Tests: `src/components/SettingsDialog.test.tsx`.

## 2026-09-15 — Product stars and favorite-first sidebar shortcuts

- Type: `requirement`
- Products can now be starred from the detail header; the toggle saves through the existing project upsert, so the starred state persists and the product list shows the star.
- The sidebar product shortcuts list starred products first, then the most recently updated, keeping only the top three; the full list stays under “全部产品”.
- Tests: `src/components/ProjectPanel.test.tsx`, `src/components/Sidebar.test.tsx`.

## 2026-09-13 — Sidebar shows the three most recently updated products

- Type: `optimization`
- The sidebar product shortcuts now list only the three most recently updated products, ordered purely by update time; the full list remains available under “全部产品”.
- Tests: `src/components/Sidebar.test.tsx`.

## 2026-09-13 — Editable product compositions

- Type: `optimization`
- Product compositions (services) can now be edited in place like products: each row gains an edit action that opens the structure dialog prefilled, and saving updates name and description by id while keeping the composition's environments and usage bindings intact.
- Structure rows align their action buttons in a shared actions container; the dialog title distinguishes adding from editing.
- Tests: `src/components/ProjectPanel.test.tsx`.

## 2026-09-09 — Full product paths and clickable used credentials

- Type: `optimization`
- Credential details show the full product path (product / composition / environment) for each usage binding instead of only the consumer's own name; consumers removed from the tree keep the stored fallback name.
- Product details list used credentials with the same full path, and clicking a credential card opens that credential's detail dialog without leaving the product view.
- Tests: `src/lib/format.test.ts`, `src/components/DetailPanel.test.tsx`, `src/components/ProjectPanel.test.tsx`.

## 2026-09-08 — Offline transitive license evidence

- Type: requirement
- Collect the Windows npm/Cargo dependency graphs, version-pinned upstream license/NOTICE texts, native and installer notices, and MPL/installer source archives. Correct the SQLCipher inventory to the shipped 4.14.0 source.
- Add lazy offline license-text viewing and bundle the original files and source archives. Extend legal checks to detect stale lockfiles, missing or modified texts and source archives.
- Record the unverified internal dependency versions of the prebuilt NSIS utility plugin as a remaining release gate; do not claim complete compliance.
- Tests: LegalDialog original-text display and scripts/legal-evidence.node-test.mjs integrity regressions.

## 2026-09-08 — Chinese MSI packaging

- Type: bugfix
- Set WiX installer language to zh-CN so the Chinese product name can be encoded without LGHT0311 failures.
- Regression: scripts/smoke-check.mjs verifies the MSI language configuration.


## 2026-09-08 — Automatic encrypted backups while open

- Type: requirement
- Default daily automatic backups, with hourly/weekly/off settings and an optional local destination. The default is the vault backups folder. No additional service or process; closing or locking pauses checks and overdue backups run on the next unlock.
- Rust serializes encrypted exports with vault operations and persists the last successful time per destination. Failures retry, history is retained, and existing encrypted restore remains supported.
- Tests: automatic backup timing, restart, failure retry and restore; timer lifecycle and settings controls.

## 2026-09-08 — Editable products and local logos

- Type: requirement
- Product details now edit the name and description, preserving existing associations and metadata. Create/edit supports local PNG/JPEG logos up to 1 MB, preview, replacement and restoring the default icon.
- Logos display in the sidebar, product list and details and persist inside SQLCipher through migration 0003; no remote resources or new dependencies.
- Tests: product editor cancellation/save and logo removal; Rust product persistence, logo validation and migration tests.

## 2026-09-07 — Third-party maintenance rules for AI contributors

- Type: `maintenance`
- Added AGENTS.md requirements to update inventories and notices with dependency/resource additions, upgrades, replacements and removals.
- Require upstream rights and license/NOTICE preservation, shipped transitive/resource review, and disclosure of unresolved obligations.
- Documented existing checker limitations. Contributor rules only; no application behavior changes.

## 2026-09-07 — Replace personal-use restriction with no-sale terms

- Type: `requirement`
- Adopted Rhizome No-Sale License 1.0: personal, organizational and business use are allowed; sales, paid use licenses and paid downloads require written permission.
- Separate paid services are permitted subject to anti-circumvention terms. Third-party license rights remain unchanged.
- Updated README, bilingual terms (version 1.1) and license checks. Regression: `src/components/LegalDialog.test.tsx`.

## 2026-09-07 — Project README and personal-use license

- Type: `maintenance`
- Added README with product scope, development instructions and Chinese/English licensing explanations.
- Added bilingual Rhizome Personal Use License 1.0 for personal non-commercial use; third-party license rights remain unchanged.
- Package metadata and future native bundles reference the project license. `scripts/legal-check.mjs` checks those references.

## 2026-09-07 — Relationships in credential forms

- Type: `requirement`
- Added optional, searchable credential relationships and product/composition/environment usage locations to new and edit forms; moved the parent selector into this section.
- Existing relationships load for editing. Cancel discards changes. A single database transaction saves the credential and relationships, retaining IDs and verification metadata for unchanged links.
- Tests: `src/components/AssetLinksEditor.test.tsx`, `src-tauri/src/storage.rs` cover form drafts, direction, atomic rollback, removal and retained relationships.

## 2026-09-07 — Silent relocking

- Type: `bug`
- Timeout, hidden-window and manual locks no longer immediately open Windows Hello. The lock screen still offers manual verification; startup quick unlock remains available.
- Regression: `src/components/VaultGate.test.tsx` covers silent relocking and manual Windows Hello.

## 2026-09-07 — Configurable window close behavior

- Settings now offer exit (default) or minimize to tray. Existing settings retain exit behavior.
- The tray supports reopening the main window and explicit exit; automatic locking remains active while hidden. The preference is loaded before unlocking on restart.
- Tests cover selecting the behavior, legacy defaults, persistence and invalid settings.

## 2026-09-07 — Key file selection in the credential editor

- Added a native file picker to new and existing key-file credentials, with filename preview and removal before saving.
- Selected files use the existing Rust encrypted attachment import, including the file passphrase, expiry and 10 MB limit. Import failures keep the editor open and retain the saved asset ID for retry.
- Regression coverage: file selection, cancellation and save handoff from the editor.

## 2026-09-03 — Privacy, terms, and open-source notices

- Type: `requirement` / `compliance` / `design`
- In-app documents: added Chinese and English privacy policy and terms of use that match the local-only, single-user data flow, encrypted backups, operating-system quick unlock, deletion behavior, and security boundary.
- Settings: added a dedicated legal area with privacy, terms, and third-party license views. Documents remain readable offline, close independently from Settings, and keep their action bar visible in short windows.
- Distribution: added a third-party runtime component inventory and configured Tauri to include the notices and bilingual legal documents in native installers.
- Maintenance: added `pnpm legal:check` to the release quality gate so newly added direct runtime dependencies cannot be omitted from the component inventory or notice file.
- Release requirement: the actual publisher identity, contact method, complete transitive notices, and required license texts must be reviewed and finalized before public distribution.
- Tests: added settings-entry, document-switching, and English privacy-page regressions.

## 2026-09-03 — Product composition for technical and non-technical products

- Type: `requirement` / `design`
- Model language: renamed the user-facing “service component” concept to “product composition”. Existing database rows and relationships remain compatible and are not rewritten.
- Scope: a composition can represent a domestic or international mini program, public account, video series, online store, website, application, or technical service.
- Relationships: credentials can be linked directly to a product composition or to one of its optional deployment environments, keeping different editions and channels independent.
- Interface: updated product pages, credential usage selectors, graph nodes, confirmations, local errors, examples, and Chinese/English copy.
- Tests: added product-page terminology and localized graph-search regressions.

## 2026-09-03 — Typed credential relationships

- Type: `requirement` / `data-model`
- Model: credentials can now be linked directly with six explicit meanings: used to register, used to sign in, used for recovery, issues credential, shared account, and other link. Relationships are directional, may carry a note, and are protected by foreign keys and duplicate/self-link validation.
- Detail: a credential can create either an outgoing or incoming relationship without leaving its detail dialog, and each saved row shows the complete source → relationship → target chain.
- Graph: credential relationships appear as labeled directed edges alongside platform, product, service, and environment dependencies.
- Migration: added schema migration 2 for `asset_relations`; existing encrypted vaults upgrade in place without rewriting credential payloads.
- Tests: added storage round-trip, deletion, graph-edge, and detail-form direction regressions.

## 2026-09-03 — Chinese and English interface

- Type: `requirement` / `design`
- Language: added a saved interface-language choice for following the operating system, Simplified Chinese, or English. System mode updates when the Windows or macOS language changes.
- Coverage: navigation, credential lists and editors, product and relationship views, settings, lock and recovery flows, standard field names, generated status text, and known local errors now use the selected language.
- Compatibility: existing settings default to following the system. Stored credential names, values, custom field labels, tags, notes, platform names, and encrypted data are never translated or rewritten.
- Tests: added translation, operating-system language resolution, settings persistence and validation, old-settings compatibility, and English environment-label regressions.

## 2026-09-03 — Product review, plain-language pass, and complete desktop regression

- Type: `bugfix` / `design` / `quality`
- Language: removed decorative English section labels and replaced system-oriented terms such as downstream consumer, rotation, and vault-key wrapping with direct personal-use wording. Type-specific examples now use ordinary accounts, a personal website, a home server, and a local database rather than an AI-product scenario.
- Readability: increased base, navigation, control, table, core-field, and graph-node type sizes. Rebalanced the six credential columns so a common 1280-pixel desktop window does not show an unnecessary horizontal scrollbar, while preserving copy actions beside populated fields.
- Editor: added type-specific credential-name examples, localized common environment names, retained database and connection dropdowns, and confirmed that category creation selects its type while editing keeps the type locked.
- Graph: packed disconnected relationship groups into rows, used each group’s own credential depth, reduced fit-view whitespace, enlarged labels, and changed relationship wording to “提供/关联”. Search, node inspection, connection traversal, and full-detail navigation remain available.
- Windows Hello: an enabled quick unlock now requests verification automatically once when the lock screen opens. The manual retry button remains available after cancellation, and the native prompt continues to be owned by the Rhizome window.
- Tests: added settings, product, lock-screen, graph-packing, environment-label, terminology, and type-specific placeholder regressions. Completed browser walkthroughs for create, edit, list, detail, product, graph, settings, theme, lock, and quick-unlock flows.
- Terminology: unified the remaining user-facing Rust errors on “凭证库”, removing the last legacy “保险库” wording.

## 2026-09-02 — Context-aware asset creation

- Type: `bugfix` / `design`
- Create: using the add action from a type-filtered list now initializes the editor with that sidebar type instead of always falling back to Website Account; the all-credentials view retains Website Account as its default.
- Edit: existing credentials no longer show the asset-type tabs, preventing accidental conversion of a stored credential into another schema.
- Tests: added shell coverage for sidebar-aware creation and editor coverage for immutable types during editing.

## 2026-09-02 — Layered dependency graph routing

- Type: `bugfix` / `design`
- Layout: the graph now derives credential depth from actual platform and parent relationships, then places platform, credential chain, product, service, and environment in distinct left-to-right layers.
- Routing: every dependency uses right-side source and left-side target anchors with rounded orthogonal lanes, preventing the former top/bottom paths from folding back across nodes.
- Scale: disconnected dependency groups receive separate vertical bands, and nodes within each layer are centered to reduce crossings and unused space.
- Tests: replaced the shared-column assertion with a complete platform-to-environment layering regression.

## 2026-09-02 — Native title-bar theme synchronization

- Type: `bugfix`
- Windows: the native title bar now receives the same system, light, or dark preference as the Rhizome interface whenever settings are loaded or changed.
- System mode: clearing the native override lets Windows continue to update the title bar when the operating-system appearance changes.
- Tests: added preference mapping coverage for system, light, dark, and invalid values.

## 2026-09-02 — Categorical credential fields

- Type: `requirement` / `design`
- Editor: fixed-category metadata now uses dropdowns instead of error-prone free text, including database engine, database connection mode, deployment environment, and server operating-system family.
- Coverage: database choices include common international and Chinese engines, while each catalog retains an “Other” choice and preserves previously stored custom values.
- Tests: added editor coverage for selecting and saving database engine and connection mode.

## 2026-09-02 — One-click theme toggle

- Type: `bugfix`
- Theme: the toolbar toggle now switches directly between the effective dark and light appearances; dark mode no longer passes through the visually identical system-dark state and require a second click.
- System mode: when following Windows, the toggle resolves the current system appearance and changes to its opposite in one click. System-following remains available in Settings.
- Tests: added a shell regression covering a single-click change from dark to light.

## 2026-09-02 — Windows Hello owned prompt

- Type: `bugfix`
- Windows: Windows Hello verification now uses the desktop interop API with the active Rhizome HWND as its owner, instead of opening an unowned system window that waits behind a separate taskbar item.
- Focus: Rhizome activates its current window before requesting verification, so the operating-system prompt appears immediately in front of the lock or settings screen.
- Boundary: the verification UI remains the trusted Windows system dialog; no biometric data enters Rhizome.
- Tests: added a Windows-only API-shape regression ensuring both quick-unlock paths require an owner window handle.

## 2026-09-02 — Built-in platform suggestions

- Type: `requirement` / `design`
- Editor: the platform field now offers local, type-specific suggestions covering common Chinese and international AI, cloud, account, database, and key-file platforms.
- Consistency: recognized aliases such as `aws`, `aliyun`, `gemini`, and `kimi` normalize to canonical display names on blur and save.
- Flexibility: suggestions remain optional, so personal, self-hosted, and niche platforms can still be entered without restriction.
- Tests: added catalog and editor coverage for relevance, alias normalization, and custom-value preservation.

## 2026-09-02 — Settings footer visibility

- Type: `bugfix`
- Layout: divided the settings dialog into fixed header and footer rows with an independently scrolling body, constrained to the dynamic viewport so Close and Save Settings remain fully visible.

## 2026-09-02 — Asset expiry icon spacing

- Type: `design`
- Visual: increased the spacing between the clock icon and “长期有效” or the expiry date, and prevented the icon from shrinking in narrow time columns.

## 2026-09-02 — Copyable masked field previews in the asset list

- Type: `requirement` / `security`
- List: populated sensitive fields now appear as Rust-generated partial previews instead of the ambiguous “无非敏感字段” message; ordinary fields remain readable.
- Action: every populated core field has an inline copy button that uses the existing Rust clipboard policy and does not open the asset detail dialog.
- Security: full sensitive values are still excluded from list responses; the React list receives only masked previews and copies the original by asset and field identifiers.
- Tests: expanded storage and shell regression coverage for masked summaries, source-value exclusion, and inline copy behavior.

## 2026-09-02 — Relevant asset metadata and safe editor footer

- Type: `requirement` / `bugfix`
- Metadata: removed the user-facing “用户名索引” input; list and search metadata is now derived automatically from the type-specific username field.
- Relevance: environment is shown only for deployment-bound API credentials, servers, and databases. Saving other asset types clears obsolete environment metadata.
- Layout: constrained the editor to the dynamic viewport and made its form explicitly reserve a non-scrolling footer row so Cancel and Save remain fully visible.
- Tests: added regression coverage for automatic username indexing and type-specific environment visibility.

## 2026-09-02 — Standard fields by asset type

- Type: `requirement` / `design`
- Editor: each of the six asset types now presents a concise fixed standard field set; standard field names and sensitivity cannot be accidentally renamed, deleted, or reclassified.
- Extension: “添加自定义字段” adds a separate editable row whose label, value, sensitivity, and removal remain user-controlled.
- Compatibility: existing field keys and encrypted storage remain unchanged; older records missing a standard field can populate it without a database migration.
- Tests: added exact template-contract coverage and editor regression coverage separating standard and custom fields.

## 2026-09-02 — Product-wide credential terminology

- Type: `design`
- Language: standardized the user-facing umbrella term as “凭证”; “密钥” is reserved for concrete items such as API keys, SSH private keys, and key files.
- Coverage: replaced “秘密” across navigation, search, empty states, editor titles, project dependencies, folder confirmation, onboarding, and operation feedback without renaming internal persistence fields or commands.
- Compatibility: this is a presentation-only change and does not alter existing vault data or backup formats.

## 2026-09-02 — Searchable and inspectable dependency graph

- Type: `requirement` / `design`
- Search: added local node search across platform, credential, product, service, environment, name, and subtitle; Enter or a result click locates and focuses the matching node.
- Detail: selecting a node now opens an in-graph inspector with its type, description, upstream/downstream counts, connected nodes, and relationship labels. Connected nodes can be followed without leaving the graph.
- Navigation: the inspector can open full asset details, the owning product, or the matching platform asset list.
- Visual: increased node size and typography, localized node types, added directional edge arrows, improved dark-theme edge labels, separated the legend from the minimap, and dims unrelated nodes and edges while tracing a selection.
- Tests: added coverage for graph search and incoming/outgoing connection detail generation.

## 2026-09-02 — Detail dialog outside-click dismissal

- Type: `bugfix`
- Interaction: clicking the shaded area outside an asset detail now closes the detail dialog, while clicks inside the panel continue to interact with the asset.
- Accessibility: the dismissal target is a real labeled button behind the dialog rather than an unlabeled click handler on a static container.
- Tests: added a regression test covering outside dismissal and inside-click isolation.

## 2026-09-02 — Server-specific credentials and visible editor actions

- Type: `requirement` / `bugfix`
- Fix: the asset editor now owns the available viewport with a fixed header and action footer, so Cancel and Save remain fully visible while only the form body scrolls.
- Server model: server records now expose structured host, port, operating system, provider, username, and login-method controls instead of treating every value as an undifferentiated custom row.
- Authentication: password login stores a username and password; SSH-key login stores a username, encrypted private-key content, and an optional key passphrase. Switching methods removes the incompatible credential from the saved record.
- Search: the server login username automatically becomes the non-secret username hint used by the asset list and search.
- Tests: added template and editor regression coverage for mutually exclusive server credentials, action availability, and the saved username index.

## 2026-09-02 — Desktop experience and reliability audit

- Type: `bugfix` / `design`
- Visual: replaced the permanent detail column with a narrower on-demand side dialog, removed the duplicate top-bar search, tightened the navigation rail, modernized typography and contrast, and resized the asset table so its six core columns fit a typical desktop window without immediate horizontal scrolling.
- Visual: reused the packaged Rhizome application artwork for the in-app brand, kept platform marks bundled locally, added clearer loading/progress states, and aligned light, dark, modal, form, graph, and empty-state styling.
- Interaction: `Ctrl+K` now targets the single asset search field; filter controls close with Escape or an outside click and can be reset; details show a local-loading state immediately after row selection; long operations expose a progress line instead of appearing frozen.
- Fix: removed a self-deadlock in reveal/copy commands caused by reacquiring the vault-session mutex while it was already held. Secret-policy reads now happen before the database lock, and clipboard access happens after the database lock is released.
- Fix: sensitive fields now hide independently using the expiry returned by Rust, rather than extending every visible field with a shared hard-coded 30-second timer. The reveal duration is now configurable and validated with the other local security settings.
- Fix: graph layout now assigns service and environment nodes separate rows in their shared column and computes positions in one pass instead of repeatedly scanning the complete graph.
- Resilience: concurrent operations no longer clear the global busy state prematurely; async failures from project, folder, detail, unlock, file, and relationship actions are handled without unhandled promise rejections; Windows Hello activation shows an explicit waiting state and recovers on cancellation.
- Tooling: quality and release scripts now invoke the manifest-pinned pnpm through Corepack internally, so a different global pnpm can no longer break the verification chain after the first command.
- Accessibility: added a skip link, one semantic search entry point, explicit field names/labels, live status and error messaging, dynamic reveal labels, keyboard dismissal for filters and dialogs, and complete labels for icon-only modal actions.
- Tests: added Rust coverage for the reveal-policy deadlock and validation, frontend coverage for per-field reveal expiry, graph node separation, quick-unlock progress/recovery, filter dismissal, and the revised single-search workflow.

## 2026-09-02 — Rhizome and platform logo system

- Type: `requirement`
- Change: replaced text initials with a reusable visual identity system across asset rows, detail dialogs, and graph nodes.
- Coverage: bundled local logos recognize common AI, cloud, developer, database, and account platforms, including DeepSeek, OpenAI, Google, Alibaba Cloud, AWS, Azure, Tencent Cloud, GitHub, PostgreSQL, MySQL, MongoDB, and Redis; unknown values fall back to the asset-kind icon.
- Privacy: brand SVG data is compiled into the desktop bundle through `simple-icons`; no remote image, CDN, or runtime network request was introduced.
- Brand: added a local Rhizome key-and-root SVG mark and aligned it with the existing application icon language.
- Tests: added `src/components/PlatformLogo.test.tsx` for alias recognition, database-field recognition, and unknown-platform fallback.

## 2026-09-02 — Asset-first desktop layout and responsiveness fixes

- Type: `requirement` / `bugfix`
- Change: made the asset table the primary workspace, moved asset details into an on-demand side dialog, exposed every non-sensitive core field in list rows, increased interface type sizes, and added working sort/filter, keyboard search, detail close, and detail action-menu controls.
- Security: list responses continue to omit every field marked sensitive; passwords, tokens, secret keys, and private-key content remain available only through explicit reveal/copy commands.
- Fix: moved Windows Hello consent work off the Tauri UI thread, stopped holding the vault session lock while the system prompt is open, cached the availability probe, and made command dispatch asynchronous so database and backup work cannot block window event handling.
- Fix: all settings operations now clear their busy state in `finally`, including Windows Hello cancellation and errors, so a failed quick-unlock attempt cannot leave the dialog stuck.
- Performance: stale asset-list and detail responses are ignored, refresh work is serialized, and expensive backdrop blur was removed.
- Tooling: Tauri development/build hooks now invoke the project-pinned pnpm through Corepack instead of whichever global pnpm appears first on `PATH`.
- Tests: expanded `src/App.test.tsx` with detail-dialog/list-field coverage and a quick-unlock failure regression; expanded `src-tauri/src/storage.rs` to prove list summaries include non-sensitive fields while excluding secret values.

## 2026-09-02 — Initial personal vault vertical slice

- Type: `requirement`
- Change: initialized Rhizome as a Tauri 2 offline personal vault with encrypted storage, six long-lived asset types, project dependency mapping, graph/search UI, recovery-key backup, and light/dark themes.
- Reason: consolidate personally managed credentials and make every downstream use visible before rotation.
- Tests: `src/App.test.tsx`, `src/lib/assetTemplates.test.ts`, `src-tauri/src/crypto.rs`, `src-tauri/src/storage.rs`, `src-tauri/src/backup.rs`.

### Delivered scope notes

- Added nested personal folders, service components, deployment environments, asset-to-service/environment bindings, and product-to-secret reverse lookup.
- Kept SQLCipher memory security enabled on Windows by reserving sufficient process working-set quota before `VirtualLock` is used.
- Added master-password change, one-time recovery-key rotation, encrypted backup restore, Windows Hello-backed quick unlock, conditional clipboard clearing, and lock-on-hidden behavior.
- Expanded direct SQLCipher tests for folders, product structure, graph consistency, wrong credentials, ciphertext tampering, and backup integrity.
- Updated the Vite React plugin to the Vite 8-compatible 6.1.1 line and moved production transforms/minification to Vite 8's Oxc pipeline.
- Aligned the JavaScript/Rust Tauri dialog plugin at 2.7.3 and generated the unsigned Windows x64 NSIS installer.
- Verified `pnpm quality`, the native debug build, production dependency audit, and release artifact smoke check. RustSec advisory download remains pending because this workstation could not reach GitHub over HTTPS.
- Windows ARM64 packaging remains pending the UAC-approved installation of `Microsoft.VisualStudio.Component.VC.Tools.ARM64`; no partial installer process was left running.
