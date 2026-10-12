import { open } from "@tauri-apps/plugin-dialog";
import { Dices, Eye, EyeOff, Plus, Star, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { AssetLinksEditor } from "./AssetLinksEditor";
import { DEFAULT_GENERATOR_RULES, PasswordGeneratorPanel } from "./PasswordGeneratorPanel";
import {
  emptyAsset,
  FIELD_TEMPLATES,
  GENERATABLE_FIELD_KEYS,
  getServerAuthMethod,
  KIND_LABELS,
  SERVER_AUTH_LABELS,
  SERVER_MANAGED_FIELD_KEYS,
  type ServerAuthMethod,
  switchAssetKind,
  switchServerAuthMethod,
} from "../lib/assetTemplates";
import { normalizePlatformName, platformOptionsFor } from "../lib/platformCatalog";
import { useI18n } from "../lib/i18n";
import type {
  AssetInput,
  AssetKind,
  AssetSummary,
  Folder,
  PasswordGeneratorOptions,
  SecretFieldInput,
  Project,
} from "../types";

interface AssetEditorProps {
  projects?: Project[];
  initial?: AssetInput | null;
  assets: AssetSummary[];
  folders: Folder[];
  generatorRules?: PasswordGeneratorOptions;
  onGeneratorRulesSave?: (rules: PasswordGeneratorOptions) => Promise<void>;
  onCancel: () => void;
  onSave: (
    input: AssetInput,
    sourcePath?: string,
    onPersisted?: (id: string) => void,
  ) => Promise<void>;
}

const ENVIRONMENT_KINDS = new Set<AssetKind>(["api_credential", "server", "database"]);
const ENVIRONMENT_OPTIONS = ["Dev", "Test", "Staging", "Prod"] as const;
const ENVIRONMENT_LABELS: Record<(typeof ENVIRONMENT_OPTIONS)[number], string> = {
  Dev: "开发",
  Test: "测试",
  Staging: "预发布",
  Prod: "生产",
};
const TITLE_PLACEHOLDERS: Record<AssetKind, string> = {
  web_account: "例如：Google 主账号",
  api_credential: "例如：GitHub API",
  server: "例如：家庭服务器",
  database: "例如：家庭服务数据库",
  recovery: "例如：硬盘恢复密钥",
  secret_file: "例如：服务器 SSH 私钥",
};
const SERVER_OS_OPTIONS = [
  "Ubuntu Linux",
  "Debian Linux",
  "RHEL / CentOS",
  "Rocky / AlmaLinux",
  "Windows Server",
  "其他 Linux",
  "其他",
] as const;
const STANDARD_FIELD_OPTIONS: Partial<Record<string, readonly string[]>> = {
  engine: [
    "MySQL",
    "PostgreSQL",
    "MariaDB",
    "Microsoft SQL Server",
    "Oracle Database",
    "SQLite",
    "MongoDB",
    "Redis",
    "ClickHouse",
    "Elasticsearch",
    "TiDB",
    "OceanBase",
    "达梦数据库",
    "人大金仓 KingbaseES",
    "其他",
  ],
  connection_mode: [
    "TCP/IP 直连",
    "TLS/SSL",
    "SSH 隧道",
    "Unix Socket",
    "本机文件",
    "云代理",
    "其他",
  ],
};
const includesOption = (options: readonly string[], value: string) => options.includes(value);

const FIELD_PLACEHOLDERS: Record<string, string> = {
  username: "例如：name@example.com",
  password: "输入密码",
  login_url: "https://example.com/login",
  totp_secret: "Base32 种子",
  backup_codes: "用逗号或换行分隔",
  recovery_contact: "备用邮箱或手机",
  api_key: "API Key",
  access_key_id: "Access Key ID",
  secret_access_key: "Secret Access Key",
  token: "长期 Token",
  scopes: "例如：read, write",
  quota: "例如：每月 10,000 次",
  engine: "MySQL / PostgreSQL / SQL Server",
  host: "db.example.com",
  port: "3306",
  database: "数据库名",
  connection_mode: "TCP / TLS / SSH Tunnel",
  recovery_code: "恢复码",
  pin: "PIN",
  security_question: "安全问题",
  security_answer: "安全答案",
  license_key: "许可证密钥",
  passphrase: "文件口令",
  purpose: "用途",
};

export function AssetEditor({
  initial,
  assets,
  folders,
  projects = [],
  generatorRules,
  onGeneratorRulesSave,
  onCancel,
  onSave,
}: AssetEditorProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [draft, setDraft] = useState<AssetInput>(() => initial || emptyAsset());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [generatorField, setGeneratorField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const isEdit = Boolean(initial?.id);
  const valid = draft.title.trim().length > 0;
  const serverAuthMethod = getServerAuthMethod(draft);
  const platformOptions = platformOptionsFor(draft.kind);
  const standardFieldKeys =
    draft.kind === "server"
      ? SERVER_MANAGED_FIELD_KEYS
      : new Set(FIELD_TEMPLATES[draft.kind].map((item) => item.key));
  const standardFields =
    draft.kind === "server"
      ? []
      : FIELD_TEMPLATES[draft.kind].map((template) => ({
          ...template,
          value: draft.fields.find((item) => item.key === template.key)?.value ?? template.value,
        }));
  const customFields = draft.fields
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !standardFieldKeys.has(item.key));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, saving]);

  const update = <K extends keyof AssetInput>(key: K, value: AssetInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const updateField = (index: number, next: Partial<SecretFieldInput>) => {
    update(
      "fields",
      draft.fields.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)),
    );
  };
  const fieldValue = (key: string) => draft.fields.find((item) => item.key === key)?.value ?? "";
  const updateFieldValue = (key: string, value: string) => {
    setDraft((current) => {
      const hasField = current.fields.some((item) => item.key === key);
      if (hasField) {
        return {
          ...current,
          fields: current.fields.map((item) => (item.key === key ? { ...item, value } : item)),
        };
      }
      const template = FIELD_TEMPLATES[current.kind].find((item) => item.key === key);
      return template
        ? { ...current, fields: [...current.fields, { ...template, value }] }
        : current;
    });
  };
  const toggleReveal = (key: string) => {
    setRevealed((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const changeServerAuthMethod = (method: ServerAuthMethod) => {
    setDraft((current) => switchServerAuthMethod(current, method));
    setRevealed(new Set());
    setGeneratorField(null);
  };
  const generatorPanel = (fieldKey: string, applyValue: (value: string) => void) =>
    generatorField === fieldKey ? (
      <PasswordGeneratorPanel
        rules={generatorRules ?? DEFAULT_GENERATOR_RULES}
        onApply={applyValue}
        onPersistRules={onGeneratorRulesSave ?? (async () => undefined)}
        onClose={() => setGeneratorField(null)}
      />
    ) : null;
  const generateButton = (fieldKey: string) => (
    <button
      type="button"
      className="secret-input__generate"
      onClick={() => setGeneratorField((current) => (current === fieldKey ? null : fieldKey))}
      aria-label={t("生成密码")}
      aria-expanded={generatorField === fieldKey}
    >
      <Dices size={16} />
    </button>
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError("");
    try {
      const prepared =
        draft.kind === "server" ? switchServerAuthMethod(draft, serverAuthMethod) : draft;
      const standardTemplates = new Map(
        FIELD_TEMPLATES[prepared.kind].map((item) => [item.key, item]),
      );
      const normalizedFields = prepared.fields.map((item) => {
        const template = standardTemplates.get(item.key);
        return prepared.kind !== "server" && template
          ? { ...item, label: template.label, sensitive: template.sensitive }
          : item;
      });
      const username = normalizedFields.find((item) => item.key === "username")?.value.trim();
      const input = {
        ...prepared,
        fields: normalizedFields,
        title: prepared.title.trim(),
        platform: normalizePlatformName(prepared.platform),
        usernameHint: username || "",
        environment: ENVIRONMENT_KINDS.has(prepared.kind) ? prepared.environment.trim() : "",
        tags: prepared.tags.filter(Boolean),
      };
      if (draft.kind === "secret_file" && sourcePath) {
        await onSave(input, sourcePath, (id) =>
          setDraft((current) => ({
            ...current,
            id,
            links: current.links
              ? {
                  relations: current.links.relations.map((relation) => ({
                    ...relation,
                    sourceAssetId: relation.sourceAssetId || id,
                    targetAssetId: relation.targetAssetId || id,
                  })),
                  bindings: current.links.bindings.map((binding) => ({ ...binding, assetId: id })),
                }
              : undefined,
          })),
        );
      } else {
        await onSave(input);
      }
    } catch (reason) {
      setError(String(reason));
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          <div>
            <h2 id={titleId}>{isEdit ? t("编辑凭证") : t("新增凭证")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label={t("关闭")}
            disabled={saving}
          >
            <X size={19} />
          </button>
        </header>
        <form onSubmit={submit}>
          <div className="editor-scroll">
            {!isEdit && (
              <fieldset className="kind-picker">
                <legend className="sr-only">{t("资产类型")}</legend>
                {(Object.keys(KIND_LABELS) as AssetKind[]).map((kind) => (
                  <button
                    type="button"
                    aria-pressed={draft.kind === kind}
                    className={draft.kind === kind ? "active" : ""}
                    key={kind}
                    onClick={() => setDraft((current) => switchAssetKind(current, kind))}
                  >
                    {t(KIND_LABELS[kind])}
                  </button>
                ))}
              </fieldset>
            )}
            <div className="form-grid form-grid--two">
              <label className="span-two">
                <span>{t("名称 *")}</span>
                <input
                  value={draft.title}
                  name="asset-title"
                  onChange={(event) => update("title", event.target.value)}
                  placeholder={t(TITLE_PLACEHOLDERS[draft.kind])}
                  required
                />
              </label>
              <label>
                <span>{t("平台")}</span>
                <input
                  value={draft.platform}
                  name="asset-platform"
                  list={`${titleId}-platform-options`}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => update("platform", event.target.value)}
                  onBlur={() => update("platform", normalizePlatformName(draft.platform))}
                  placeholder={platformOptions
                    .slice(0, 3)
                    .map((option) => option.name)
                    .join(" / ")}
                />
                <datalist id={`${titleId}-platform-options`}>
                  {platformOptions.map((option) => (
                    <option key={option.name} value={option.name} />
                  ))}
                </datalist>
                <small className="form-hint">{t("从常用平台中选择，也可输入其他名称")}</small>
              </label>
              {ENVIRONMENT_KINDS.has(draft.kind) && (
                <label>
                  <span>{t("环境")}</span>
                  <select
                    value={draft.environment}
                    name="asset-environment"
                    onChange={(event) => update("environment", event.target.value)}
                  >
                    <option value="">{t("通用 / 未指定")}</option>
                    {draft.environment &&
                      !includesOption(ENVIRONMENT_OPTIONS, draft.environment) && (
                        <option value={draft.environment}>
                          {draft.environment} ({t("已有值")})
                        </option>
                      )}
                    {ENVIRONMENT_OPTIONS.map((environment) => (
                      <option key={environment} value={environment}>
                        {t(ENVIRONMENT_LABELS[environment])}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                <span>{t("过期日期")}</span>
                <input
                  type="date"
                  name="asset-expiry"
                  value={draft.expiresAt?.slice(0, 10) || ""}
                  onChange={(event) => update("expiresAt", event.target.value || null)}
                />
              </label>
              <label>
                <span>{t("文件夹")}</span>
                <select
                  value={draft.folderId || ""}
                  name="asset-folder"
                  onChange={(event) => update("folderId", event.target.value || null)}
                >
                  <option value="">{t("未归档")}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.parentId ? "↳ " : ""}
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("标签")}</span>
                <input
                  value={draft.tags.join(", ")}
                  name="asset-tags"
                  onChange={(event) =>
                    update(
                      "tags",
                      event.target.value.split(/[,，]/).map((tag) => tag.trim()),
                    )
                  }
                  placeholder={t("个人、工作、重要")}
                />
              </label>
            </div>

            <div className="secret-fields-head">
              <div>
                <h3>
                  {draft.kind === "server"
                    ? t("服务器连接")
                    : t("{kind}标准字段", { kind: t(KIND_LABELS[draft.kind]) })}
                </h3>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update("fields", [
                    ...draft.fields,
                    {
                      key: `custom_${Date.now()}`,
                      label: t("自定义字段"),
                      value: "",
                      sensitive: true,
                    },
                  ])
                }
              >
                <Plus size={15} />
                {t("添加自定义字段")}
              </button>
            </div>

            {draft.kind === "server" && (
              <section className="server-connection-fields" aria-label={t("服务器连接信息")}>
                <div className="server-field-grid">
                  <label className="span-two">
                    <span>{t("IP / 主机名")}</span>
                    <input
                      value={fieldValue("host")}
                      name="server-host"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => updateFieldValue("host", event.target.value)}
                      placeholder={t("例如：192.168.1.20 或 server.example.com")}
                    />
                  </label>
                  <label>
                    <span>{t("端口")}</span>
                    <input
                      value={fieldValue("port")}
                      name="server-port"
                      inputMode="numeric"
                      onChange={(event) => updateFieldValue("port", event.target.value)}
                      placeholder="22"
                    />
                  </label>
                  <label>
                    <span>{t("操作系统")}</span>
                    <select
                      value={fieldValue("os")}
                      name="server-os"
                      onChange={(event) => updateFieldValue("os", event.target.value)}
                    >
                      <option value="">{t("未选择")}</option>
                      {fieldValue("os") && !includesOption(SERVER_OS_OPTIONS, fieldValue("os")) && (
                        <option value={fieldValue("os")}>
                          {fieldValue("os")} ({t("已有值")})
                        </option>
                      )}
                      {SERVER_OS_OPTIONS.map((operatingSystem) => (
                        <option key={operatingSystem} value={operatingSystem}>
                          {t(operatingSystem)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="span-two">
                    <span>{t("云平台 / 机房")}</span>
                    <input
                      value={fieldValue("provider")}
                      name="server-provider"
                      onChange={(event) => updateFieldValue("provider", event.target.value)}
                      placeholder={t("阿里云 / AWS / 腾讯云 / 家庭机房")}
                    />
                  </label>
                </div>

                <fieldset className="server-auth-picker">
                  <legend>{t("登录方式")}</legend>
                  <div>
                    {(Object.keys(SERVER_AUTH_LABELS) as ServerAuthMethod[]).map((method) => (
                      <button
                        type="button"
                        key={method}
                        className={serverAuthMethod === method ? "active" : ""}
                        aria-pressed={serverAuthMethod === method}
                        onClick={() => changeServerAuthMethod(method)}
                      >
                        {t(SERVER_AUTH_LABELS[method])}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="server-field-grid server-field-grid--credentials">
                  <label className="span-two">
                    <span>{t("登录用户名")}</span>
                    <input
                      value={fieldValue("username")}
                      name="server-username"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => updateFieldValue("username", event.target.value)}
                      placeholder="root / ubuntu / Administrator"
                    />
                  </label>

                  {serverAuthMethod === "password" ? (
                    <div className="field-group span-two">
                      <span>{t("登录密码")}</span>
                      <div className="secret-input secret-input--generatable">
                        <input
                          type={revealed.has("password") ? "text" : "password"}
                          value={fieldValue("password")}
                          name="server-password"
                          autoComplete="new-password"
                          spellCheck={false}
                          onChange={(event) => updateFieldValue("password", event.target.value)}
                          aria-label={t("登录密码")}
                        />
                        {generateButton("password")}
                        <button
                          type="button"
                          onClick={() => toggleReveal("password")}
                          aria-label={
                            revealed.has("password") ? t("隐藏登录密码") : t("显示登录密码")
                          }
                        >
                          {revealed.has("password") ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {generatorPanel("password", (value) => updateFieldValue("password", value))}
                    </div>
                  ) : (
                    <>
                      <div className="field-group span-two">
                        <span>{t("SSH 私钥")}</span>
                        <div
                          className={`secret-input secret-input--multiline ${
                            revealed.has("private_key") ? "is-revealed" : ""
                          }`}
                        >
                          <textarea
                            rows={5}
                            value={fieldValue("private_key")}
                            name="server-private-key"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) =>
                              updateFieldValue("private_key", event.target.value)
                            }
                            aria-label={t("SSH 私钥")}
                            placeholder={t("粘贴 OpenSSH、PEM 或 PPK 私钥内容")}
                          />
                          <button
                            type="button"
                            onClick={() => toggleReveal("private_key")}
                            aria-label={
                              revealed.has("private_key") ? t("遮罩 SSH 私钥") : t("显示 SSH 私钥")
                            }
                          >
                            {revealed.has("private_key") ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          {!revealed.has("private_key") && fieldValue("private_key") && (
                            <span className="secret-input__mask" aria-hidden="true">
                              {t("私钥已填写")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="field-group span-two">
                        <span>{t("密钥口令（可选）")}</span>
                        <div className="secret-input secret-input--generatable">
                          <input
                            type={revealed.has("key_passphrase") ? "text" : "password"}
                            value={fieldValue("key_passphrase")}
                            name="server-key-passphrase"
                            autoComplete="new-password"
                            spellCheck={false}
                            onChange={(event) =>
                              updateFieldValue("key_passphrase", event.target.value)
                            }
                            aria-label={t("密钥口令")}
                          />
                          {generateButton("key_passphrase")}
                          <button
                            type="button"
                            onClick={() => toggleReveal("key_passphrase")}
                            aria-label={
                              revealed.has("key_passphrase") ? t("隐藏密钥口令") : t("显示密钥口令")
                            }
                          >
                            {revealed.has("key_passphrase") ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                        {generatorPanel("key_passphrase", (value) =>
                          updateFieldValue("key_passphrase", value),
                        )}
                      </div>
                    </>
                  )}
                </div>
                <p className="server-auth-note">
                  {serverAuthMethod === "password"
                    ? t("适用于 SSH、远程桌面或控制台的用户名密码登录。")
                    : t("私钥和口令只保存在这条凭证中。")}
                </p>
              </section>
            )}

            {standardFields.length > 0 && (
              <section
                className="standard-field-editor"
                aria-label={t("{kind}标准字段", { kind: t(KIND_LABELS[draft.kind]) })}
              >
                {standardFields.map((item) => (
                  <div className="field-slot" key={item.key}>
                    <label htmlFor={`${titleId}-standard-${item.key}`}>
                      <span>{t(item.label)}</span>
                      {STANDARD_FIELD_OPTIONS[item.key] ? (
                        <select
                          id={`${titleId}-standard-${item.key}`}
                          value={item.value}
                          name={`standard-${item.key}`}
                          onChange={(event) => updateFieldValue(item.key, event.target.value)}
                        >
                          <option value="">{t("未选择")}</option>
                          {item.value &&
                            !STANDARD_FIELD_OPTIONS[item.key]?.includes(item.value) && (
                              <option value={item.value}>
                                {item.value} ({t("已有值")})
                              </option>
                            )}
                          {STANDARD_FIELD_OPTIONS[item.key]?.map((option) => (
                            <option key={option} value={option}>
                              {t(option)}
                            </option>
                          ))}
                        </select>
                      ) : item.sensitive ? (
                        <div
                          className={`secret-input ${
                            GENERATABLE_FIELD_KEYS.has(item.key) ? "secret-input--generatable" : ""
                          }`}
                        >
                          <input
                            id={`${titleId}-standard-${item.key}`}
                            type={revealed.has(item.key) ? "text" : "password"}
                            value={item.value}
                            name={`standard-${item.key}`}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={t(FIELD_PLACEHOLDERS[item.key])}
                            onChange={(event) => updateFieldValue(item.key, event.target.value)}
                          />
                          {GENERATABLE_FIELD_KEYS.has(item.key) && generateButton(item.key)}
                          <button
                            type="button"
                            onClick={() => toggleReveal(item.key)}
                            aria-label={
                              revealed.has(item.key)
                                ? t("隐藏 {label}", { label: t(item.label) })
                                : t("显示 {label}", { label: t(item.label) })
                            }
                          >
                            {revealed.has(item.key) ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      ) : (
                        <input
                          id={`${titleId}-standard-${item.key}`}
                          type={item.key === "login_url" ? "url" : "text"}
                          value={item.value}
                          name={`standard-${item.key}`}
                          autoComplete="off"
                          spellCheck={false}
                          inputMode={item.key === "port" ? "numeric" : undefined}
                          placeholder={t(FIELD_PLACEHOLDERS[item.key])}
                          onChange={(event) => updateFieldValue(item.key, event.target.value)}
                        />
                      )}
                    </label>
                    {generatorPanel(item.key, (value) => updateFieldValue(item.key, value))}
                  </div>
                ))}
              </section>
            )}

            {draft.kind === "secret_file" && (
              <section className="field-group" aria-label={t("密钥文件")}>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={async () => {
                    try {
                      const selected = await open({
                        multiple: false,
                        title: t("选择密钥或证书文件"),
                      });
                      if (typeof selected === "string") {
                        setSourcePath(selected);
                        setError("");
                        if (!draft.title.trim())
                          update("title", selected.split(/[\\/]/).pop() || "");
                      }
                    } catch {
                      setError(t("无法打开文件选择窗口，请重试。"));
                    }
                  }}
                >
                  <Plus size={16} /> {t("选择密钥或证书文件")}
                </button>
                {sourcePath && (
                  <div className="attachment-row">
                    <span>{sourcePath.split(/[\\/]/).pop()}</span>
                    <button type="button" disabled={saving} onClick={() => setSourcePath("")}>
                      {t("移除所选文件")}
                    </button>
                  </div>
                )}
                <small>
                  {t("每个文件最多 10 MB，保存时加密存入凭证库。已有文件可在详情中管理。")}
                </small>
              </section>
            )}

            {customFields.length > 0 && (
              <>
                <h4 className="supplementary-fields-title">{t("自定义字段")}</h4>
                <div className="secret-field-editor">
                  {customFields.map(({ item, index }) => (
                    <div className="secret-field-row" key={item.key}>
                      <input
                        className="secret-field-row__label"
                        value={item.label}
                        onChange={(event) => updateField(index, { label: event.target.value })}
                        aria-label={t("字段 {number} 名称", { number: index + 1 })}
                      />
                      <div
                        className={`secret-input ${
                          item.sensitive ? "secret-input--generatable" : ""
                        }`}
                      >
                        <input
                          type={item.sensitive && !revealed.has(item.key) ? "password" : "text"}
                          value={item.value}
                          name={`secret-${item.key}`}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(event) => updateField(index, { value: event.target.value })}
                          aria-label={item.label}
                        />
                        {item.sensitive && generateButton(item.key)}
                        {item.sensitive && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(item.key)}
                            aria-label={revealed.has(item.key) ? t("隐藏") : t("显示")}
                          >
                            {revealed.has(item.key) ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        )}
                      </div>
                      <label className="sensitive-toggle">
                        <input
                          type="checkbox"
                          checked={item.sensitive}
                          onChange={(event) =>
                            updateField(index, { sensitive: event.target.checked })
                          }
                        />
                        <span>{t("敏感")}</span>
                      </label>
                      <button
                        type="button"
                        className="bare-danger"
                        onClick={() =>
                          update(
                            "fields",
                            draft.fields.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label={t("删除 {label}", { label: item.label })}
                      >
                        <Trash2 size={15} />
                      </button>
                      {item.sensitive &&
                        generatorPanel(item.key, (value) => updateField(index, { value }))}
                    </div>
                  ))}
                </div>
              </>
            )}

            <AssetLinksEditor
              draft={draft}
              assets={assets}
              projects={projects}
              disabled={saving}
              onChange={(next) => setDraft((current) => ({ ...current, ...next }))}
            />
            <label className="field-group">
              <span>{t("备注")}</span>
              <textarea
                rows={4}
                value={draft.notes}
                name="asset-notes"
                onChange={(event) => update("notes", event.target.value)}
                placeholder={t("用途、注意事项或更换步骤……")}
              />
            </label>
            <label className="favorite-check">
              <input
                type="checkbox"
                checked={draft.favorite}
                onChange={(event) => update("favorite", event.target.checked)}
              />
              <Star size={16} fill={draft.favorite ? "currentColor" : "none"} />
              <span>{t("加入星标收藏")}</span>
            </label>
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <footer className="modal-actions">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
              {t("取消")}
            </button>
            <button type="submit" className="primary-button" disabled={!valid || saving}>
              {saving ? t("正在保存…") : t("保存凭证")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
