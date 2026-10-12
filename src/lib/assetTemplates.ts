import type { AssetInput, AssetKind, SecretFieldInput } from "../types";

export const KIND_LABELS: Record<AssetKind, string> = {
  web_account: "网站账号",
  api_credential: "API 凭证",
  server: "服务器",
  database: "数据库",
  recovery: "恢复凭证",
  secret_file: "密钥文件",
};

export const KIND_SHORT: Record<AssetKind, string> = {
  web_account: "账号",
  api_credential: "API",
  server: "主机",
  database: "数据",
  recovery: "恢复",
  secret_file: "文件",
};

export type ServerAuthMethod = "password" | "ssh_key";

export const SERVER_AUTH_LABELS: Record<ServerAuthMethod, string> = {
  password: "用户名 + 密码",
  ssh_key: "用户名 + SSH 密钥",
};

const field = (key: string, label: string, sensitive = true, value = ""): SecretFieldInput => ({
  key,
  label,
  value,
  sensitive,
});

const serverFields = (authMethod: ServerAuthMethod): SecretFieldInput[] => [
  field("host", "IP / 主机名", false),
  field("port", "端口", false, "22"),
  field("provider", "云平台", false),
  field("os", "操作系统", false),
  field("auth_method", "登录方式", false, SERVER_AUTH_LABELS[authMethod]),
  field("username", "用户名", false),
  ...(authMethod === "password"
    ? [field("password", "登录密码")]
    : [field("private_key", "SSH 私钥"), field("key_passphrase", "密钥口令")]),
];

export const SERVER_MANAGED_FIELD_KEYS = new Set([
  "host",
  "port",
  "provider",
  "os",
  "auth_method",
  "username",
  "password",
  "private_key",
  "key_passphrase",
]);

// Standard fields whose value the user chooses themselves, so the in-app
// password generator is offered for them; provider-issued secrets (TOTP,
// backup codes, API keys…) are typed in manually.
export const GENERATABLE_FIELD_KEYS = new Set(["password", "key_passphrase", "passphrase"]);

export const FIELD_TEMPLATES: Record<AssetKind, SecretFieldInput[]> = {
  web_account: [
    field("username", "用户名", false),
    field("password", "密码"),
    field("login_url", "登录 URL", false),
    field("totp_secret", "TOTP 密钥"),
    field("backup_codes", "备用验证码"),
    field("recovery_contact", "密保邮箱 / 手机"),
  ],
  api_credential: [
    field("api_key", "API Key"),
    field("access_key_id", "Access Key ID", false),
    field("secret_access_key", "Secret Access Key"),
    field("token", "长期 Token"),
    field("scopes", "权限范围", false),
    field("quota", "配额", false),
  ],
  server: serverFields("password"),
  database: [
    field("engine", "数据库类型", false),
    field("host", "主机", false),
    field("port", "端口", false),
    field("database", "数据库名", false),
    field("username", "用户名", false),
    field("password", "密码"),
    field("connection_mode", "连接方式", false),
  ],
  recovery: [
    field("recovery_code", "恢复码"),
    field("pin", "PIN"),
    field("security_question", "安全问题", false),
    field("security_answer", "安全答案"),
    field("license_key", "许可证密钥"),
  ],
  secret_file: [field("passphrase", "文件口令"), field("purpose", "用途", false)],
};

export function emptyAsset(kind: AssetKind = "web_account"): AssetInput {
  return {
    kind,
    title: "",
    platform: "",
    usernameHint: "",
    environment: "",
    notes: "",
    favorite: false,
    expiresAt: null,
    parentAssetId: null,
    folderId: null,
    tags: [],
    fields: FIELD_TEMPLATES[kind].map((item) => ({ ...item })),
  };
}

export function switchAssetKind(input: AssetInput, kind: AssetKind): AssetInput {
  const values = new Map(input.fields.map((item) => [item.key, item.value]));
  return {
    ...input,
    kind,
    fields: FIELD_TEMPLATES[kind].map((item) => ({
      ...item,
      value: values.get(item.key) ?? item.value,
    })),
  };
}

export function getServerAuthMethod(input: AssetInput): ServerAuthMethod {
  const stored = input.fields.find((item) => item.key === "auth_method")?.value;
  if (stored === SERVER_AUTH_LABELS.ssh_key || stored === "ssh_key") return "ssh_key";
  if (input.fields.some((item) => item.key === "private_key" && item.value.trim()))
    return "ssh_key";
  return "password";
}

export function switchServerAuthMethod(
  input: AssetInput,
  authMethod: ServerAuthMethod,
): AssetInput {
  if (input.kind !== "server") return input;
  const values = new Map(input.fields.map((item) => [item.key, item.value]));
  const customFields = input.fields.filter((item) => !SERVER_MANAGED_FIELD_KEYS.has(item.key));
  return {
    ...input,
    fields: [
      ...serverFields(authMethod).map((item) => ({
        ...item,
        value:
          item.key === "auth_method"
            ? SERVER_AUTH_LABELS[authMethod]
            : (values.get(item.key) ?? item.value),
      })),
      ...customFields,
    ],
  };
}
