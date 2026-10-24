import type { AppLanguage } from "../lib/i18n";

export type LegalDocumentId = "privacy" | "terms" | "open-source";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  title: string;
  version: string;
  introduction: string;
  sections: LegalSection[];
}

const privacyZh: LegalDocument = {
  title: "隐私政策",
  version: "版本 1.0 · 生效日期：2026 年 9 月 3 日",
  introduction:
    "龙盾 是一款单用户、本地运行的凭证管理工具。本政策说明软件在你的设备上如何处理数据。龙盾 运行时不向发布者收集、上传或出售你的凭证及使用信息。",
  sections: [
    {
      title: "1. 适用范围与发布者",
      paragraphs: [
        "本政策适用于 龙盾 桌面应用。软件发布者及有效联系方式以 龙盾 官方下载页面公布的信息为准；如需提出隐私相关问题，请使用该页面所列的支持方式联系发布者。",
      ],
    },
    {
      title: "2. 在本机处理的数据",
      items: [
        "你主动录入的账号、密码、API 凭证、服务器和数据库信息、密钥文件、恢复信息、备注、标签，以及产品和依赖关系。",
        "凭证库位置、界面语言、主题、自动锁定、显示时限和剪贴板清除时限等本地设置。",
        "为快速解锁而交由 Windows Hello 或 macOS 系统认证机制保护的密钥包装数据。龙盾 不读取或保存指纹、面容等生物识别模板。",
        "你主动复制到系统剪贴板的内容，以及你主动选择导入、导出或备份的本地文件。",
      ],
    },
    {
      title: "3. 处理目的与方式",
      paragraphs: [
        "上述数据仅用于在你的设备上保存、检索、展示和关联凭证，完成加密备份与恢复，并执行你主动发起的复制、导入、导出和系统解锁操作。龙盾 不建立云端账号，不进行广告画像、跨设备同步或遥测分析。",
      ],
    },
    {
      title: "4. 存储与安全",
      items: [
        "凭证库及附件加密保存在你选择或软件建立的本地目录中。主密码本身不会被保存。",
        "敏感值默认遮罩，并在设定时间后自动隐藏；复制内容会在设定时间后尝试清除，但仅在剪贴板内容未被其他内容替换时执行。",
        "快速解锁由操作系统安全能力完成；不可用或验证失败时回退到主密码。",
        "任何本地安全措施都不能完全抵御已控制设备的管理员、恶意软件、屏幕录制或物理攻击。请保持操作系统和终端安全。",
      ],
    },
    {
      title: "5. 数据传输与第三方",
      paragraphs: [
        "龙盾 发布版本不包含云同步、遥测、广告、远程字体、远程脚本或业务网络请求。开源组件在本机参与界面、加密、数据库和系统集成，不会因此把你的凭证发送给其作者。第三方组件及许可可在“第三方开源许可”中查看。",
      ],
    },
    {
      title: "6. 备份、迁移与恢复",
      paragraphs: [
        "备份由你主动导出到所选位置，并保持加密。恢复需要主密码或恢复密钥。发布者不持有解密材料，无法找回忘记的主密码、恢复密钥或丢失的凭证库。请把恢复密钥和备份保存在彼此独立的可信位置。",
      ],
    },
    {
      title: "7. 保存期限、删除与卸载",
      paragraphs: [
        "数据会保留在本机，直到你在应用中永久删除、删除凭证库目录或清理备份。移入回收站不等于永久删除。卸载应用不保证删除你另行选择的凭证库、备份或导出文件，你需要自行确认并处理这些文件。",
      ],
    },
    {
      title: "8. 你的控制权",
      paragraphs: [
        "你可以随时查看、修改、复制、导出、移入回收站或永久删除本地数据，也可以关闭快速解锁并停止使用软件。由于数据不上传给发布者，发布者通常没有可供代为查询、更正或删除的服务器端个人信息。",
      ],
    },
    {
      title: "9. 未成年人",
      paragraphs: [
        "龙盾 不以未成年人为专门服务对象，也不会主动识别用户年龄。请勿在无合法授权的情况下保存他人的个人信息，尤其是未满十四周岁未成年人的信息。",
      ],
    },
    {
      title: "10. 政策更新",
      paragraphs: [
        "如果数据处理方式发生实质变化，更新版本会同步修改本政策及生效日期。涉及新增联网、遥测或云端处理的变化，不会在未明确告知的情况下启用。",
      ],
    },
  ],
};

const privacyEn: LegalDocument = {
  title: "Privacy Policy",
  version: "Version 1.0 · Effective September 3, 2026",
  introduction:
    "Loongdun is a single-user credential manager that runs locally. This policy explains how the app handles data on your device. During normal use, Loongdun does not collect, upload, sell, or otherwise send your credentials or usage information to the publisher.",
  sections: [
    {
      title: "1. Scope and publisher",
      paragraphs: [
        "This policy applies to the Loongdun desktop application. The publisher identity and current contact details are provided on the official Loongdun download page. Use the support method listed there for privacy enquiries.",
      ],
    },
    {
      title: "2. Data processed on your device",
      items: [
        "Accounts, passwords, API credentials, server and database details, key files, recovery information, notes, tags, products, and dependency relationships that you enter.",
        "Local settings such as the credential-vault location, interface language, theme, auto-lock period, reveal period, and clipboard-clearing period.",
        "Wrapped key material protected by Windows Hello or the macOS authentication system for quick unlock. Loongdun does not read or store biometric templates such as fingerprints or facial data.",
        "Values you copy to the system clipboard and local files you explicitly choose to import, export, or back up.",
      ],
    },
    {
      title: "3. Purpose and method",
      paragraphs: [
        "This data is processed only on your device to store, search, display, and relate credentials; create and restore encrypted backups; and perform copy, import, export, and system-unlock actions that you request. Loongdun does not create a cloud account, build advertising profiles, synchronize devices, or perform telemetry analytics.",
      ],
    },
    {
      title: "4. Storage and security",
      items: [
        "The credential vault and attachments are encrypted in a local directory selected by you or created by the app. The master password itself is not stored.",
        "Sensitive values are masked by default and hidden again after the configured period. Copied content is cleared after the configured period only if the clipboard has not since been replaced.",
        "Quick unlock relies on operating-system security and falls back to the master password when unavailable or unsuccessful.",
        "No local safeguard can fully protect a device already controlled by an administrator, malware, screen capture, or physical attack. Keep your operating system and device secure.",
      ],
    },
    {
      title: "5. Transfers and third parties",
      paragraphs: [
        "Release builds do not include cloud sync, telemetry, advertising, remote fonts, remote scripts, or business network requests. Open-source components support the local interface, encryption, database, and operating-system integration; their inclusion does not send your credentials to their authors. See Third-party open-source licenses for component notices.",
      ],
    },
    {
      title: "6. Backup, migration, and recovery",
      paragraphs: [
        "You export encrypted backups to a location you choose. Restoration requires the master password or recovery key. The publisher does not possess decryption material and cannot recover a forgotten master password, missing recovery key, or lost credential vault. Keep recovery material and backups in separate trusted locations.",
      ],
    },
    {
      title: "7. Retention, deletion, and uninstalling",
      paragraphs: [
        "Data remains on your device until you permanently delete it in the app, delete the credential-vault directory, or remove backups. Moving an item to Trash is not permanent deletion. Uninstalling the app does not guarantee removal of credential vaults, backups, or exports stored in locations you selected; review and remove those files yourself when appropriate.",
      ],
    },
    {
      title: "8. Your controls",
      paragraphs: [
        "You can view, change, copy, export, trash, or permanently delete local data, disable quick unlock, and stop using the app at any time. Because the data is not uploaded, the publisher normally has no server-side personal information to access, correct, or delete for you.",
      ],
    },
    {
      title: "9. Children",
      paragraphs: [
        "Loongdun is not directed specifically to children and does not attempt to determine a user's age. Do not store another person's information without lawful authorization, especially information about children under the age applicable in your jurisdiction.",
      ],
    },
    {
      title: "10. Changes to this policy",
      paragraphs: [
        "If data-handling practices materially change, an updated release will revise this policy and its effective date. Network access, telemetry, or cloud processing will not be enabled without clear notice.",
      ],
    },
  ],
};

const termsZh: LegalDocument = {
  title: "用户协议",
  version: "版本 1.1 · 生效日期：2026 年 9 月 7 日",
  introduction:
    "本协议适用于 龙盾 桌面应用。下载、安装或使用软件表示你理解并接受本协议；如不同意，请停止使用并卸载软件。",
  sections: [
    {
      title: "1. 软件用途",
      paragraphs: [
        "龙盾 用于个人管理长期使用的账号、密钥、凭证文件及其使用关系。软件不提供云端托管、代登录、自动填充、自动轮换或发布者协助恢复服务。",
      ],
    },
    {
      title: "2. 使用许可",
      paragraphs: [
        "个人、企业及其他组织均可免费使用 龙盾，包括工作和内部业务用途。Loongdun No-Sale License 1.0 允许修改和免费分享；未经相关权利人书面授权，不得销售原版或修改版、收费授予使用许可、收费分发或收费提供下载。独立的安装、技术支持及托管服务不因收费而被一概禁止，但不得变相收取软件副本、使用许可或下载费用。完整条件以随附 LICENSE 为准。第三方组件仍适用各自许可证。",
      ],
    },
    {
      title: "3. 合法与授权使用",
      items: [
        "只保存你有权持有、管理或使用的账号、凭证和个人信息。",
        "不得利用软件实施未经授权的访问、规避安全控制、侵犯隐私或其他违法行为。",
        "如凭证属于第三方平台或服务，你仍须遵守该平台或服务的条款。",
      ],
    },
    {
      title: "4. 主密码、恢复密钥与设备责任",
      paragraphs: [
        "你负责妥善保存主密码、恢复密钥、凭证库、备份及设备。发布者不保存这些解密材料，无法为你重置主密码或恢复已遗失的数据。不要把恢复密钥与凭证库只保存在同一设备或同一磁盘。",
      ],
    },
    {
      title: "5. 备份与验证",
      paragraphs: [
        "你应根据数据重要性定期创建并验证加密备份，在升级、迁移或大量修改前额外备份。关系图和备注用于辅助管理，不能替代实际系统配置、平台控制台或专业审计；更换密钥前请自行核对真实使用位置。",
      ],
    },
    {
      title: "6. 安全边界",
      paragraphs: [
        "龙盾 通过本地加密、自动锁定、短时显示和剪贴板清除降低风险，但不能保证绝对安全，也不能抵御已控制设备的管理员、恶意软件、键盘记录、屏幕录制、弱主密码或不安全备份。",
      ],
    },
    {
      title: "7. 软件状态与责任限制",
      paragraphs: [
        "在适用法律允许的最大范围内，软件按现状提供，不承诺无中断、无错误或适合所有用途。因忘记密码、丢失恢复密钥、设备故障、误删、第三方平台变更或未经授权访问造成的损失，由责任方依法承担；本条不排除适用法律中不得排除或限制的责任。",
      ],
    },
    {
      title: "8. 更新与兼容性",
      paragraphs: [
        "你可以自行决定是否安装新版本。发布者可能为安全、兼容性或功能调整软件和协议，并在发布记录中说明重要变化。旧版本可能不再获得修复，但不会在未明确告知的情况下启用云同步、遥测或自动更新。",
      ],
    },
    {
      title: "9. 第三方软件",
      paragraphs: [
        "龙盾 包含开源软件。相关著作权、许可和免责声明归各自权利人所有，可在应用的“第三方开源许可”及随发行包提供的声明中查看。开源组件的名称不表示其作者对 龙盾 提供担保或背书。",
      ],
    },
    {
      title: "10. 停止使用",
      paragraphs: [
        "你可以随时停止使用并卸载软件。卸载前请确认是否需要保留加密备份；卸载后，你仍需自行删除位于用户选择目录中的凭证库、备份和导出文件。",
      ],
    },
    {
      title: "11. 适用规则与联系",
      paragraphs: [
        "本协议受适用法律约束。若部分条款无效，不影响其他条款。发布者身份和联系方式以 龙盾 官方下载页面公布的信息为准。",
      ],
    },
  ],
};

const termsEn: LegalDocument = {
  title: "Terms of Use",
  version: "Version 1.1 · Effective September 7, 2026",
  introduction:
    "These terms apply to the Loongdun desktop application. By downloading, installing, or using the app, you acknowledge and accept these terms. If you do not agree, stop using and uninstall the app.",
  sections: [
    {
      title: "1. Purpose",
      paragraphs: [
        "Loongdun helps an individual manage long-lived accounts, keys, credential files, and their usage relationships. It does not provide cloud hosting, sign in on your behalf, browser autofill, automatic credential rotation, or publisher-assisted recovery.",
      ],
    },
    {
      title: "2. License to use",
      paragraphs: [
        "Individuals, companies, and other organizations may use Loongdun free of charge, including for work and internal business. The Loongdun No-Sale License 1.0 permits modification and free sharing; selling original or modified copies, paid use licenses, paid distribution, or charging for downloads requires written permission from the relevant rights holders. Separate installation, support, and hosting services are not prohibited merely because they are paid, but must not disguise charges for software copies, use licenses, or downloads. See the accompanying LICENSE for full conditions. Third-party components retain their own licenses.",
      ],
    },
    {
      title: "3. Lawful and authorized use",
      items: [
        "Store only accounts, credentials, and personal information that you are authorized to possess, manage, or use.",
        "Do not use the app for unauthorized access, circumvention of security controls, privacy violations, or unlawful conduct.",
        "Credentials for a third-party platform remain subject to that platform's terms.",
      ],
    },
    {
      title: "4. Master password, recovery key, and device",
      paragraphs: [
        "You are responsible for protecting the master password, recovery key, credential vault, backups, and device. The publisher does not retain decryption material and cannot reset your master password or recover lost data. Do not keep the only copies of the recovery key and vault on the same device or disk.",
      ],
    },
    {
      title: "5. Backups and verification",
      paragraphs: [
        "Create and test encrypted backups according to the importance of your data, with an additional backup before upgrades, migration, or bulk changes. Dependency maps and notes assist personal organization but do not replace actual system configuration, platform consoles, or a professional audit. Verify real usage before rotating a credential.",
      ],
    },
    {
      title: "6. Security boundary",
      paragraphs: [
        "Local encryption, auto-lock, temporary reveal, and clipboard clearing reduce risk but cannot provide absolute security or defeat a compromised administrator account, malware, keylogging, screen capture, a weak master password, or unsafe backups.",
      ],
    },
    {
      title: "7. App status and limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by applicable law, the app is provided as is, without a promise that it will be uninterrupted, error-free, or suitable for every purpose. Responsibility for loss caused by forgotten passwords, missing recovery keys, device failure, accidental deletion, third-party platform changes, or unauthorized access is determined under applicable law. Nothing here excludes liability that cannot lawfully be excluded or limited.",
      ],
    },
    {
      title: "8. Updates and compatibility",
      paragraphs: [
        "You decide whether to install a new version. The publisher may change the app or these terms for security, compatibility, or functionality and will describe material changes in release notes. Older releases may stop receiving fixes, but cloud sync, telemetry, or automatic updates will not be enabled without clear notice.",
      ],
    },
    {
      title: "9. Third-party software",
      paragraphs: [
        "Loongdun includes open-source software. Copyrights, licenses, and disclaimers remain with their respective owners and are listed under Third-party open-source licenses and in notices shipped with the release. Naming a component does not imply that its authors warrant or endorse Loongdun.",
      ],
    },
    {
      title: "10. Stopping use",
      paragraphs: [
        "You may stop using and uninstall the app at any time. Before uninstalling, decide whether to retain an encrypted backup. You remain responsible for deleting credential vaults, backups, and exports stored in user-selected locations.",
      ],
    },
    {
      title: "11. Applicable rules and contact",
      paragraphs: [
        "These terms are subject to applicable law. If one provision is invalid, the others remain in effect. The publisher identity and contact details are provided on the official Loongdun download page.",
      ],
    },
  ],
};

export function getLegalDocument(
  id: Exclude<LegalDocumentId, "open-source">,
  language: AppLanguage,
): LegalDocument {
  if (id === "privacy") return language === "en-US" ? privacyEn : privacyZh;
  return language === "en-US" ? termsEn : termsZh;
}
