import { invoke } from "@tauri-apps/api/core";
import type {
  AssetDetail,
  AssetInput,
  AssetKind,
  AssetRelation,
  AssetRelationInput,
  AssetSummary,
  BackupInspection,
  Environment,
  EnvironmentInput,
  Folder,
  FolderInput,
  GeneratedPassword,
  GraphData,
  InitializeVaultResult,
  PasswordGeneratorOptions,
  Project,
  ProjectInput,
  RevealResult,
  Service,
  ServiceInput,
  UsageBinding,
  UsageBindingInput,
  VaultSettings,
  VaultStatus,
} from "../types";
import { createDemoApi } from "./demoApi";

export interface AssetQuery {
  query?: string;
  kind?: AssetKind;
  folderId?: string;
  favoritesOnly?: boolean;
  includeDeleted?: boolean;
}

const tauriApi = {
  vaultStatus: () => invoke<VaultStatus>("vault_status"),
  initializeVault: (vaultPath: string, password: string) =>
    invoke<InitializeVaultResult>("initialize_vault", { vaultPath, password }),
  unlockVault: (password: string, useRecovery = false) =>
    invoke<VaultStatus>("unlock_vault", { password, useRecovery }),
  unlockWithSystem: () => invoke<VaultStatus>("unlock_with_system"),
  enableSystemUnlock: () => invoke<VaultStatus>("enable_system_unlock"),
  disableSystemUnlock: () => invoke<VaultStatus>("disable_system_unlock"),
  lockVault: () => invoke<VaultStatus>("lock_vault"),
  changeMasterPassword: (currentPassword: string, nextPassword: string) =>
    invoke<void>("change_master_password", { currentPassword, nextPassword }),
  rotateRecoveryKey: () => invoke<string>("rotate_recovery_key"),
  generatePassword: (options: PasswordGeneratorOptions) =>
    invoke<GeneratedPassword>("generate_password", { options }),

  listAssets: (filter: AssetQuery) => invoke<AssetSummary[]>("list_assets", { filter }),
  getAsset: (assetId: string) => invoke<AssetDetail>("get_asset", { assetId }),
  getAssetForEdit: (assetId: string) => invoke<AssetInput>("get_asset_for_edit", { assetId }),
  saveAsset: ({ links, ...input }: AssetInput) =>
    invoke<AssetDetail>("save_asset", { input, links: links ?? null }),
  listFolders: () => invoke<Folder[]>("list_folders"),
  saveFolder: (input: FolderInput) => invoke<Folder>("save_folder", { input }),
  deleteFolder: (folderId: string) => invoke<void>("delete_folder", { folderId }),
  trashAsset: (assetId: string) => invoke<void>("trash_asset", { assetId }),
  restoreAsset: (assetId: string) => invoke<void>("restore_asset", { assetId }),
  purgeAsset: (assetId: string) => invoke<void>("purge_asset", { assetId }),
  revealSecret: (assetId: string, fieldKey: string) =>
    invoke<RevealResult>("reveal_secret", { assetId, fieldKey }),
  copySecret: (assetId: string, fieldKey: string) =>
    invoke<void>("copy_secret", { assetId, fieldKey }),
  addAttachment: (assetId: string, sourcePath: string, passphrase: string, expiresAt?: string) =>
    invoke<AssetDetail>("add_attachment", {
      assetId,
      sourcePath,
      passphrase,
      expiresAt: expiresAt || null,
    }),
  exportAttachment: (attachmentId: string, targetPath: string) =>
    invoke<void>("export_attachment", { attachmentId, targetPath }),
  deleteAttachment: (attachmentId: string) => invoke<void>("delete_attachment", { attachmentId }),

  listProjects: () => invoke<Project[]>("list_projects"),
  saveProject: (input: ProjectInput) => invoke<Project>("save_project", { input }),
  deleteProject: (projectId: string) => invoke<void>("delete_project", { projectId }),
  saveService: (input: ServiceInput) => invoke<Service>("save_service", { input }),
  deleteService: (serviceId: string) => invoke<void>("delete_service", { serviceId }),
  saveEnvironment: (input: EnvironmentInput) => invoke<Environment>("save_environment", { input }),
  deleteEnvironment: (environmentId: string) =>
    invoke<void>("delete_environment", { environmentId }),
  saveBinding: (input: UsageBindingInput) => invoke<UsageBinding>("save_binding", { input }),
  deleteBinding: (bindingId: string) => invoke<void>("delete_binding", { bindingId }),
  saveAssetRelation: (input: AssetRelationInput) =>
    invoke<AssetRelation>("save_asset_relation", { input }),
  deleteAssetRelation: (relationId: string) =>
    invoke<void>("delete_asset_relation", { relationId }),
  graphData: (focusId?: string) => invoke<GraphData>("graph_data", { focusId: focusId || null }),

  getSettings: () => invoke<VaultSettings>("get_settings"),
  saveSettings: (settings: VaultSettings) => invoke<VaultSettings>("save_settings", { settings }),
  autoBackup: () => invoke<string | null>("auto_backup"),
  exportBackup: (targetPath: string) => invoke<void>("export_backup", { targetPath }),
  inspectBackup: (backupPath: string) => invoke<BackupInspection>("inspect_backup", { backupPath }),
  restoreBackup: (
    backupPath: string,
    targetPath: string,
    credential: string,
    useRecovery: boolean,
  ) =>
    invoke<VaultStatus>("restore_backup", {
      backupPath,
      targetPath,
      credential,
      useRecovery,
    }),
};

const demoMode =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("demo");

export const api: typeof tauriApi = demoMode ? createDemoApi() : tauriApi;
