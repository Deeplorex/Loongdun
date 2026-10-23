export type AssetKind =
  | "web_account"
  | "api_credential"
  | "server"
  | "database"
  | "recovery"
  | "secret_file";

export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = "system" | "zh-CN" | "en-US";
export type ConsumerKind = "project" | "service" | "environment";
export type AssetRelationType =
  | "used_to_register"
  | "used_to_login"
  | "used_to_recover"
  | "issues_credential"
  | "shared_account"
  | "other";

export interface SecretFieldInput {
  key: string;
  label: string;
  value: string;
  sensitive: boolean;
}

export interface SecretFieldView {
  key: string;
  label: string;
  sensitive: boolean;
  hasValue: boolean;
  value?: string | null;
}

export interface AssetInput {
  links?: AssetLinksInput;
  id?: string | null;
  kind: AssetKind;
  title: string;
  platform: string;
  usernameHint: string;
  environment: string;
  notes: string;
  favorite: boolean;
  expiresAt?: string | null;
  parentAssetId?: string | null;
  folderId?: string | null;
  tags: string[];
  fields: SecretFieldInput[];
}

export interface AssetLinksInput {
  relations: AssetRelationInput[];
  bindings: UsageBindingInput[];
}

export interface AssetSummary {
  id: string;
  kind: AssetKind;
  title: string;
  platform: string;
  usernameHint: string;
  environment: string;
  favorite: boolean;
  expiresAt?: string | null;
  parentAssetId?: string | null;
  folderId?: string | null;
  deletedAt?: string | null;
  updatedAt: string;
  tags: string[];
  coreFields: AssetListField[];
}

export interface AssetListField {
  key: string;
  label: string;
  value: string;
  sensitive: boolean;
}

export interface AttachmentMeta {
  id: string;
  assetId: string;
  filename: string;
  format: string;
  fingerprint: string;
  sha256: string;
  sizeBytes: number;
  hasPassphrase: boolean;
  expiresAt?: string | null;
  createdAt: string;
}

export interface UsageBinding {
  id: string;
  assetId: string;
  assetTitle: string;
  consumerKind: ConsumerKind;
  consumerId: string;
  consumerName: string;
  purpose: string;
  configKey: string;
  environment: string;
  notes: string;
  lastVerifiedAt?: string | null;
}

export interface UsageBindingInput {
  assetId: string;
  consumerKind: ConsumerKind;
  consumerId: string;
  purpose: string;
  configKey: string;
  environment: string;
  notes: string;
}

export interface AssetRelation {
  id: string;
  sourceAssetId: string;
  sourceTitle: string;
  targetAssetId: string;
  targetTitle: string;
  relationType: AssetRelationType;
  notes: string;
}

export interface AssetRelationInput {
  sourceAssetId: string;
  targetAssetId: string;
  relationType: AssetRelationType;
  notes: string;
}

export interface Folder {
  id: string;
  parentId?: string | null;
  name: string;
}

export interface FolderInput {
  id?: string | null;
  parentId?: string | null;
  name: string;
}

export interface AssetDetail {
  summary: AssetSummary;
  notes: string;
  fields: SecretFieldView[];
  attachments: AttachmentMeta[];
  bindings: UsageBinding[];
  assetRelations: AssetRelation[];
  childAssets: AssetSummary[];
}

export interface ProjectInput {
  logo?: string;
  id?: string | null;
  name: string;
  description: string;
  repoPath: string;
  favorite: boolean;
}

export interface ServiceInput {
  id?: string | null;
  projectId: string;
  name: string;
  description: string;
}

export interface EnvironmentInput {
  id?: string | null;
  projectId: string;
  serviceId?: string | null;
  name: string;
  kind: string;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  description: string;
}

export interface Environment {
  id: string;
  projectId: string;
  serviceId?: string | null;
  name: string;
  kind: string;
}

export interface Project {
  logo?: string;
  id: string;
  name: string;
  description: string;
  repoPath: string;
  favorite: boolean;
  updatedAt: string;
  services: Service[];
  environments: Environment[];
  bindings: UsageBinding[];
}

export interface GraphNode {
  id: string;
  nodeType: "platform" | "asset" | "project" | "service" | "environment";
  label: string;
  subtitle: string;
  status?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface VaultStatus {
  state: "uninitialized" | "locked" | "unlocked";
  vaultPath?: string | null;
  defaultVaultPath?: string | null;
  systemUnlockAvailable: boolean;
  systemUnlockEnabled: boolean;
}

export interface InitializeVaultResult {
  status: VaultStatus;
  recoveryKey: string;
}

export interface RevealResult {
  value: string;
  expiresInSeconds: number;
}

export interface PasswordGeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
  requireEachSet: boolean;
}

export interface GeneratedPassword {
  value: string;
  entropyBits: number;
}

export interface VaultSettings {
  autoBackupHours?: number;
  autoBackupDirectory?: string;
  passwordGenerator?: PasswordGeneratorOptions;
  theme: ThemePreference;
  language: LanguagePreference;
  closeBehavior?: "exit" | "tray";
  autoLockMinutes: number;
  revealSeconds: number;
  clipboardSeconds: number;
}

export interface BackupInspection {
  version: number;
  createdAt: string;
  vaultId: string;
  databaseBytes: number;
}
