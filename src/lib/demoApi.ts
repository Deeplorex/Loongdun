import type {
  AssetDetail,
  AssetInput,
  AssetRelation,
  AssetRelationInput,
  AssetSummary,
  Environment,
  Folder,
  GeneratedPassword,
  GraphData,
  PasswordGeneratorOptions,
  Project,
  Service,
  UsageBinding,
  VaultSettings,
  VaultStatus,
} from "../types";
import { emptyAsset } from "./assetTemplates";
import type { AssetQuery } from "./commands";

const now = "2026-09-02T12:00:00Z";
let sequence = 20;
let status: VaultStatus = {
  state: "unlocked",
  vaultPath: "D:\\LoongdunDemo",
  systemUnlockAvailable: true,
  systemUnlockEnabled: false,
};
let settings: VaultSettings = {
  theme: "system",
  language: "system",
  expiryReminderDays: 7,
  autoLockMinutes: 5,
  revealSeconds: 30,
  clipboardSeconds: 30,
};

type DemoAsset = AssetInput & { id: string; updatedAt: string; deletedAt?: string | null };

let assets: DemoAsset[] = [
  {
    ...emptyAsset("web_account"),
    id: "asset-google",
    title: "Google 主账号",
    platform: "Google",
    usernameHint: "name@example.com",
    tags: ["个人", "重要"],
    updatedAt: now,
    fields: [
      { key: "username", label: "用户名", value: "name@example.com", sensitive: false },
      { key: "password", label: "密码", value: "demo-password", sensitive: true },
      {
        key: "login_url",
        label: "登录 URL",
        value: "https://accounts.google.com",
        sensitive: false,
      },
      { key: "totp_secret", label: "TOTP 密钥", value: "DEMOBASE32", sensitive: true },
      { key: "backup_codes", label: "备用验证码", value: "", sensitive: true },
      { key: "recovery_contact", label: "密保邮箱 / 手机", value: "", sensitive: true },
    ],
  },
  {
    ...emptyAsset("api_credential"),
    id: "asset-github",
    title: "GitHub API",
    platform: "GitHub",
    environment: "Prod",
    tags: ["工作"],
    updatedAt: "2026-08-29T09:30:00Z",
    fields: [
      { key: "api_key", label: "API Key", value: "sk-demo-1234567890", sensitive: true },
      { key: "access_key_id", label: "Access Key ID", value: "", sensitive: false },
      { key: "secret_access_key", label: "Secret Access Key", value: "", sensitive: true },
      { key: "token", label: "长期 Token", value: "", sensitive: true },
      { key: "scopes", label: "权限范围", value: "读取仓库", sensitive: false },
      { key: "quota", label: "配额", value: "每小时 5,000 次", sensitive: false },
    ],
  },
  {
    ...emptyAsset("server"),
    id: "asset-server",
    title: "家庭服务器",
    platform: "自建",
    environment: "Prod",
    tags: ["家庭"],
    updatedAt: "2026-08-25T16:00:00Z",
    fields: [
      { key: "host", label: "IP / 主机名", value: "192.168.1.20", sensitive: false },
      { key: "port", label: "端口", value: "22", sensitive: false },
      { key: "provider", label: "云平台", value: "家庭机房", sensitive: false },
      { key: "os", label: "操作系统", value: "Ubuntu Linux", sensitive: false },
      { key: "auth_method", label: "登录方式", value: "用户名 + SSH 密钥", sensitive: false },
      { key: "username", label: "用户名", value: "ubuntu", sensitive: false },
      { key: "private_key", label: "SSH 私钥", value: "DEMO PRIVATE KEY", sensitive: true },
      { key: "key_passphrase", label: "密钥口令", value: "demo-passphrase", sensitive: true },
    ],
  },
  {
    ...emptyAsset("database"),
    id: "asset-database",
    title: "家庭服务数据库",
    platform: "PostgreSQL",
    environment: "Prod",
    parentAssetId: "asset-server",
    tags: ["家庭"],
    updatedAt: "2026-08-24T10:15:00Z",
    fields: [
      { key: "engine", label: "数据库类型", value: "PostgreSQL", sensitive: false },
      { key: "host", label: "主机", value: "192.168.1.20", sensitive: false },
      { key: "port", label: "端口", value: "5432", sensitive: false },
      { key: "database", label: "数据库名", value: "home_services", sensitive: false },
      { key: "username", label: "用户名", value: "loongdun", sensitive: false },
      { key: "password", label: "密码", value: "demo-db-password", sensitive: true },
      { key: "connection_mode", label: "连接方式", value: "TCP/IP 直连", sensitive: false },
    ],
  },
];

let folders: Folder[] = [{ id: "folder-personal", name: "个人", parentId: null }];
let services: Service[] = [
  {
    id: "service-website",
    projectId: "project-website",
    name: "作品同步",
    description: "读取公开仓库并更新作品列表",
  },
];
let environments: Environment[] = [
  {
    id: "environment-daily",
    projectId: "project-website",
    serviceId: "service-website",
    name: "日常使用",
    kind: "prod",
  },
];
let bindings: UsageBinding[] = [
  {
    id: "binding-github",
    assetId: "asset-github",
    assetTitle: "GitHub API",
    consumerKind: "service",
    consumerId: "service-website",
    consumerName: "作品同步",
    purpose: "读取公开仓库",
    configKey: "GITHUB_TOKEN",
    environment: "prod",
    notes: "",
    lastVerifiedAt: "2026-09-01T08:00:00Z",
  },
];
let assetRelations: AssetRelation[] = [];
let projects: Array<Omit<Project, "services" | "environments" | "bindings">> = [
  {
    id: "project-website",
    name: "个人网站",
    description: "展示个人作品和项目记录",
    repoPath: "",
    favorite: true,
    updatedAt: now,
  },
];

const clone = <T>(value: T): T => structuredClone(value);
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

function projectRows(): Project[] {
  return projects.map((project) => {
    const projectServices = services.filter((service) => service.projectId === project.id);
    const projectEnvironments = environments.filter(
      (environment) => environment.projectId === project.id,
    );
    const consumerIds = new Set([
      project.id,
      ...projectServices.map((service) => service.id),
      ...projectEnvironments.map((environment) => environment.id),
    ]);
    return {
      ...project,
      services: projectServices,
      environments: projectEnvironments,
      bindings: bindings.filter((binding) => consumerIds.has(binding.consumerId)),
    };
  });
}

function summary(asset: DemoAsset): AssetSummary {
  const populated = asset.fields.filter((field) => field.value.trim()).slice(0, 3);
  return {
    id: asset.id,
    kind: asset.kind,
    title: asset.title,
    platform: asset.platform,
    usernameHint: asset.usernameHint,
    environment: asset.environment,
    favorite: asset.favorite,
    expiresAt: asset.expiresAt,
    parentAssetId: asset.parentAssetId,
    folderId: asset.folderId,
    deletedAt: asset.deletedAt,
    updatedAt: asset.updatedAt,
    tags: asset.tags,
    coreFields: populated.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.sensitive ? "••••••••" : field.value,
      sensitive: field.sensitive,
    })),
  };
}

function detail(assetId: string): AssetDetail {
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("没有找到这条凭证");
  return {
    summary: summary(asset),
    notes: asset.notes,
    fields: asset.fields.map((field) => ({
      key: field.key,
      label: field.label,
      sensitive: field.sensitive,
      hasValue: Boolean(field.value),
      value: field.sensitive ? null : field.value,
    })),
    attachments: [],
    bindings: bindings.filter((binding) => binding.assetId === assetId),
    assetRelations: assetRelations.filter(
      (relation) => relation.sourceAssetId === assetId || relation.targetAssetId === assetId,
    ),
    childAssets: assets.filter((item) => item.parentAssetId === assetId).map(summary),
  };
}

function graphData(): GraphData {
  const nodes: GraphData["nodes"] = [];
  const edges: GraphData["edges"] = [];
  const platforms = new Map<string, string>();
  for (const asset of assets.filter((item) => !item.deletedAt)) {
    if (asset.platform) {
      const platformId = `platform-${asset.platform.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (!platforms.has(platformId)) {
        platforms.set(platformId, asset.platform);
        nodes.push({
          id: platformId,
          nodeType: "platform",
          label: asset.platform,
          subtitle: "平台",
        });
      }
      edges.push({
        id: `${platformId}-${asset.id}`,
        source: platformId,
        target: asset.id,
        label: "提供",
      });
    }
    nodes.push({
      id: asset.id,
      nodeType: "asset",
      label: asset.title,
      subtitle: asset.kind === "api_credential" ? "API 凭证" : "凭证",
    });
    if (asset.parentAssetId) {
      edges.push({
        id: `${asset.parentAssetId}-${asset.id}`,
        source: asset.parentAssetId,
        target: asset.id,
        label: "包含",
      });
    }
  }
  for (const project of projectRows()) {
    nodes.push({ id: project.id, nodeType: "project", label: project.name, subtitle: "产品" });
    for (const service of project.services) {
      nodes.push({
        id: service.id,
        nodeType: "service",
        label: service.name,
        subtitle: project.name,
      });
      edges.push({
        id: `${project.id}-${service.id}`,
        source: project.id,
        target: service.id,
        label: "包含",
      });
    }
    for (const environment of project.environments) {
      nodes.push({
        id: environment.id,
        nodeType: "environment",
        label: environment.name,
        subtitle: project.name,
      });
      edges.push({
        id: `${environment.serviceId || project.id}-${environment.id}`,
        source: environment.serviceId || project.id,
        target: environment.id,
        label: "包含",
      });
    }
  }
  for (const binding of bindings) {
    edges.push({
      id: binding.id,
      source: binding.assetId,
      target: binding.consumerId,
      label: binding.purpose || "使用",
    });
  }
  for (const relation of assetRelations) {
    edges.push({
      id: relation.id,
      source: relation.sourceAssetId,
      target: relation.targetAssetId,
      label:
        {
          used_to_register: "用于注册",
          used_to_login: "用于登录",
          used_to_recover: "用于找回",
          issues_credential: "签发凭证",
          shared_account: "共用账号",
          other: "其他关联",
        }[relation.relationType] || "关联",
    });
  }
  return { nodes, edges };
}

// Demo-only mirror of the Rust generator so `?demo` mode renders the same rules.
const DEMO_LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DEMO_UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEMO_DIGITS = "0123456789";
const DEMO_SYMBOLS = "!@#$%^&*()[]{}?.~_+-=";
const DEMO_AMBIGUOUS = new Set("il1I|0Oo");

function demoGeneratePassword(options: PasswordGeneratorOptions): GeneratedPassword {
  const sets = (
    [
      [options.lowercase, DEMO_LOWERCASE],
      [options.uppercase, DEMO_UPPERCASE],
      [options.digits, DEMO_DIGITS],
      [options.symbols, DEMO_SYMBOLS],
    ] as const
  )
    .filter(([enabled]) => enabled)
    .map(([, characters]) => characters)
    .map((characters) =>
      options.excludeAmbiguous
        ? [...characters].filter((character) => !DEMO_AMBIGUOUS.has(character)).join("")
        : characters,
    );
  const pool = sets.join("");
  if (!pool) throw new Error("至少需要选择一类字符");
  const usable = 256 - (256 % pool.length);
  const random = new Uint8Array(64);
  const sampleOnce = () => {
    const picked: string[] = [];
    while (picked.length < options.length) {
      crypto.getRandomValues(random);
      for (const byte of random) {
        if (picked.length >= options.length) break;
        if (byte < usable) picked.push(pool[byte % pool.length]);
      }
    }
    return picked.join("");
  };
  let value = sampleOnce();
  while (options.requireEachSet && !sets.every((set) => [...value].some((c) => set.includes(c)))) {
    value = sampleOnce();
  }
  return { value, entropyBits: options.length * Math.log2(pool.length) };
}

export function createDemoApi() {
  return {
    vaultStatus: async () => clone(status),
    initializeVault: async (vaultPath: string) => {
      status = { ...status, state: "unlocked", vaultPath };
      return { status: clone(status), recoveryKey: "LOONGDUN-DEMO-RECOVERY-KEY" };
    },
    unlockVault: async () => {
      status = { ...status, state: "unlocked" };
      return clone(status);
    },
    unlockWithSystem: async () => {
      status = { ...status, state: "unlocked" };
      return clone(status);
    },
    enableSystemUnlock: async () => {
      status = { ...status, systemUnlockEnabled: true };
      return clone(status);
    },
    disableSystemUnlock: async () => {
      status = { ...status, systemUnlockEnabled: false };
      return clone(status);
    },
    lockVault: async () => {
      status = { ...status, state: "locked" };
      return clone(status);
    },
    changeMasterPassword: async () => undefined,
    rotateRecoveryKey: async () => "LOONGDUN-DEMO-NEW-RECOVERY-KEY",
    generatePassword: async (options: PasswordGeneratorOptions) => demoGeneratePassword(options),
    listAssets: async (filter: AssetQuery) => {
      const query = filter.query?.trim().toLocaleLowerCase("zh-CN");
      return assets
        .filter((asset) => (filter.includeDeleted ? true : !asset.deletedAt))
        .filter((asset) => (!filter.kind ? true : asset.kind === filter.kind))
        .filter((asset) => (!filter.folderId ? true : asset.folderId === filter.folderId))
        .filter((asset) => (!filter.favoritesOnly ? true : asset.favorite))
        .filter((asset) => {
          if (!query) return true;
          return [
            asset.title,
            asset.platform,
            asset.environment,
            asset.notes,
            ...asset.tags,
            ...asset.fields.map((field) => (field.sensitive ? "" : field.value)),
          ]
            .join(" ")
            .toLocaleLowerCase("zh-CN")
            .includes(query);
        })
        .map(summary)
        .map(clone);
    },
    getAsset: async (assetId: string) => clone(detail(assetId)),
    getAssetForEdit: async (assetId: string) => {
      const asset = assets.find((item) => item.id === assetId);
      if (!asset) throw new Error("没有找到这条凭证");
      return clone(asset);
    },
    saveAsset: async (input: AssetInput) => {
      const saved: DemoAsset = {
        ...clone(input),
        id: input.id || nextId("asset"),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      const index = assets.findIndex((asset) => asset.id === saved.id);
      const nextRelations = input.links?.relations.map((relation) => {
        const sourceAssetId = relation.sourceAssetId || saved.id;
        const targetAssetId = relation.targetAssetId || saved.id;
        const sourceTitle =
          sourceAssetId === saved.id
            ? saved.title
            : assets.find((asset) => asset.id === sourceAssetId)?.title;
        const targetTitle =
          targetAssetId === saved.id
            ? saved.title
            : assets.find((asset) => asset.id === targetAssetId)?.title;
        if (
          !sourceTitle ||
          !targetTitle ||
          sourceAssetId === targetAssetId ||
          (sourceAssetId !== saved.id && targetAssetId !== saved.id)
        )
          throw new Error("无效的凭证关联");
        return {
          ...relation,
          id: nextId("relation"),
          sourceAssetId,
          targetAssetId,
          sourceTitle,
          targetTitle,
        };
      });
      const nextBindings = input.links?.bindings.map((binding) => {
        const targets =
          binding.consumerKind === "project"
            ? projects
            : binding.consumerKind === "service"
              ? services
              : environments;
        const consumerName = targets.find((target) => target.id === binding.consumerId)?.name;
        if (!consumerName) throw new Error("无效的使用位置");
        return {
          ...binding,
          id: nextId("binding"),
          assetId: saved.id,
          assetTitle: saved.title,
          consumerName,
          lastVerifiedAt: null,
        };
      });
      if (index >= 0) assets[index] = saved;
      else assets = [saved, ...assets];
      if (nextRelations)
        assetRelations = [
          ...assetRelations.filter(
            (relation) =>
              relation.sourceAssetId !== saved.id && relation.targetAssetId !== saved.id,
          ),
          ...nextRelations,
        ];
      if (nextBindings)
        bindings = [...bindings.filter((binding) => binding.assetId !== saved.id), ...nextBindings];
      return clone(detail(saved.id));
    },
    listFolders: async () => clone(folders),
    saveFolder: async (input: { id?: string | null; parentId?: string | null; name: string }) => {
      const saved: Folder = {
        id: input.id || nextId("folder"),
        parentId: input.parentId,
        name: input.name,
      };
      const index = folders.findIndex((folder) => folder.id === saved.id);
      if (index >= 0) folders[index] = saved;
      else folders.push(saved);
      return clone(saved);
    },
    deleteFolder: async (folderId: string) => {
      folders = folders.filter((folder) => folder.id !== folderId);
      assets = assets.map((asset) =>
        asset.folderId === folderId ? { ...asset, folderId: null } : asset,
      );
    },
    trashAsset: async (assetId: string) => {
      assets = assets.map((asset) => (asset.id === assetId ? { ...asset, deletedAt: now } : asset));
    },
    restoreAsset: async (assetId: string) => {
      assets = assets.map((asset) =>
        asset.id === assetId ? { ...asset, deletedAt: null } : asset,
      );
    },
    purgeAsset: async (assetId: string) => {
      assets = assets.filter((asset) => asset.id !== assetId);
      bindings = bindings.filter((binding) => binding.assetId !== assetId);
      assetRelations = assetRelations.filter(
        (relation) => relation.sourceAssetId !== assetId && relation.targetAssetId !== assetId,
      );
    },
    revealSecret: async (assetId: string, fieldKey: string) => {
      const asset = assets.find((item) => item.id === assetId);
      const field = asset?.fields.find((item) => item.key === fieldKey);
      if (!field) throw new Error("没有找到这个字段");
      return { value: field.value, expiresInSeconds: settings.revealSeconds };
    },
    copySecret: async () => undefined,
    addAttachment: async (assetId: string) => clone(detail(assetId)),
    exportAttachment: async () => undefined,
    deleteAttachment: async () => undefined,
    listProjects: async () => clone(projectRows()),
    saveProject: async (input: {
      logo?: string;
      id?: string | null;
      name: string;
      description: string;
      repoPath: string;
      favorite: boolean;
    }) => {
      const saved = {
        ...input,
        id: input.id || nextId("project"),
        updatedAt: new Date().toISOString(),
      };
      const index = projects.findIndex((project) => project.id === saved.id);
      if (index >= 0) projects[index] = saved;
      else projects.push(saved);
      return clone({ ...saved, services: [], environments: [], bindings: [] });
    },
    deleteProject: async (projectId: string) => {
      const serviceIds = new Set(
        services.filter((service) => service.projectId === projectId).map((service) => service.id),
      );
      const environmentIds = new Set(
        environments
          .filter((environment) => environment.projectId === projectId)
          .map((environment) => environment.id),
      );
      projects = projects.filter((project) => project.id !== projectId);
      services = services.filter((service) => service.projectId !== projectId);
      environments = environments.filter((environment) => environment.projectId !== projectId);
      bindings = bindings.filter(
        (binding) =>
          binding.consumerId !== projectId &&
          !serviceIds.has(binding.consumerId) &&
          !environmentIds.has(binding.consumerId),
      );
    },
    saveService: async (input: {
      id?: string | null;
      projectId: string;
      name: string;
      description: string;
    }) => {
      const saved: Service = { ...input, id: input.id || nextId("service") };
      const index = services.findIndex((service) => service.id === saved.id);
      if (index >= 0) services[index] = saved;
      else services.push(saved);
      return clone(saved);
    },
    deleteService: async (serviceId: string) => {
      services = services.filter((service) => service.id !== serviceId);
      environments = environments.filter((environment) => environment.serviceId !== serviceId);
      bindings = bindings.filter((binding) => binding.consumerId !== serviceId);
    },
    saveEnvironment: async (input: {
      id?: string | null;
      projectId: string;
      serviceId?: string | null;
      name: string;
      kind: string;
    }) => {
      const saved: Environment = { ...input, id: input.id || nextId("environment") };
      const index = environments.findIndex((environment) => environment.id === saved.id);
      if (index >= 0) environments[index] = saved;
      else environments.push(saved);
      return clone(saved);
    },
    deleteEnvironment: async (environmentId: string) => {
      environments = environments.filter((environment) => environment.id !== environmentId);
      bindings = bindings.filter((binding) => binding.consumerId !== environmentId);
    },
    saveBinding: async (
      input: Omit<UsageBinding, "id" | "assetTitle" | "consumerName" | "lastVerifiedAt">,
    ) => {
      const assetTitle = assets.find((asset) => asset.id === input.assetId)?.title || "凭证";
      const consumerName =
        [...projects, ...services, ...environments].find((item) => item.id === input.consumerId)
          ?.name || "使用位置";
      const saved: UsageBinding = {
        ...input,
        id: nextId("binding"),
        assetTitle,
        consumerName,
        lastVerifiedAt: null,
      };
      bindings.push(saved);
      return clone(saved);
    },
    deleteBinding: async (bindingId: string) => {
      bindings = bindings.filter((binding) => binding.id !== bindingId);
    },
    saveAssetRelation: async (input: AssetRelationInput) => {
      const sourceTitle = assets.find((asset) => asset.id === input.sourceAssetId)?.title;
      const targetTitle = assets.find((asset) => asset.id === input.targetAssetId)?.title;
      if (!sourceTitle || !targetTitle) throw new Error("没有找到这条凭证");
      const existing = assetRelations.find(
        (relation) =>
          relation.sourceAssetId === input.sourceAssetId &&
          relation.targetAssetId === input.targetAssetId &&
          relation.relationType === input.relationType,
      );
      const saved: AssetRelation = {
        ...input,
        id: existing?.id || nextId("asset-relation"),
        sourceTitle,
        targetTitle,
      };
      if (existing)
        assetRelations = assetRelations.map((item) => (item.id === saved.id ? saved : item));
      else assetRelations.push(saved);
      return clone(saved);
    },
    deleteAssetRelation: async (relationId: string) => {
      assetRelations = assetRelations.filter((relation) => relation.id !== relationId);
    },
    graphData: async () => clone(graphData()),
    getSettings: async () => clone(settings),
    saveSettings: async (next: VaultSettings) => {
      settings = clone(next);
      return clone(settings);
    },
    autoBackup: async () => null,
    exportBackup: async () => undefined,
    inspectBackup: async () => ({
      version: 1,
      createdAt: now,
      vaultId: "demo",
      databaseBytes: 1024,
    }),
    restoreBackup: async () => clone(status),
  };
}
