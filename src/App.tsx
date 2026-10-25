import { LockKeyhole, Settings, SunMoon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AssetEditor } from "./components/AssetEditor";
import { AssetList } from "./components/AssetList";
import { DetailPanel } from "./components/DetailPanel";
import { GraphView } from "./components/GraphView";
import { DEFAULT_GENERATOR_RULES } from "./components/PasswordGeneratorPanel";
import { ProjectPanel } from "./components/ProjectPanel";
import { RecoveryKeyDialog } from "./components/RecoveryKeyDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { type NavigationTarget, Sidebar } from "./components/Sidebar";
import { VaultGate } from "./components/VaultGate";
import { useAutoBackup } from "./hooks/useAutoBackup";
import { useAutoLock } from "./hooks/useAutoLock";
import { emptyAsset, KIND_LABELS } from "./lib/assetTemplates";
import { api } from "./lib/commands";
import { collectExpiringAssets, todayIso } from "./lib/expiry";
import { useI18n } from "./lib/i18n";
import type {
  AssetDetail,
  AssetInput,
  AssetRelationInput,
  AssetSummary,
  EnvironmentInput,
  Folder,
  FolderInput,
  GraphData,
  GraphNode,
  InitializeVaultResult,
  PasswordGeneratorOptions,
  Project,
  ProjectInput,
  ServiceInput,
  ThemePreference,
  UsageBindingInput,
  VaultSettings,
  VaultStatus,
} from "./types";

const DEFAULT_SETTINGS: VaultSettings = {
  theme: "system",
  language: "system",
  expiryReminderDays: 7,
  autoLockMinutes: 5,
  revealSeconds: 30,
  clipboardSeconds: 30,
  passwordGenerator: DEFAULT_GENERATOR_RULES,
};
const EMPTY_GRAPH: GraphData = { nodes: [], edges: [] };

function errorMessage(
  reason: unknown,
  fallback: string,
  localize: (message: string) => string,
): string {
  if (typeof reason === "string") return localize(reason);
  if (reason instanceof Error) return localize(reason.message);
  return fallback;
}

export default function App() {
  const { setPreference, t } = useI18n();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [automaticSystemUnlock, setAutomaticSystemUnlock] = useState(true);
  const [settings, setSettings] = useState<VaultSettings>(DEFAULT_SETTINGS);
  const [assetsIndex, setAssetsIndex] = useState<AssetSummary[]>([]);
  const [visibleAssets, setVisibleAssets] = useState<AssetSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [graph, setGraph] = useState<GraphData>(EMPTY_GRAPH);
  const [navigation, setNavigation] = useState<NavigationTarget>({ view: "assets" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [editor, setEditor] = useState<AssetInput | null | false>(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryRotated, setRecoveryRotated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [today, setToday] = useState(() => todayIso());
  const [indexLoaded, setIndexLoaded] = useState(false);
  const [graphFocus, setGraphFocus] = useState<string>();
  const visibleRequest = useRef(0);
  const busyOperations = useRef(0);
  const mainContentId = useId();
  const assetSearchId = useId();

  useAutoBackup(
    status?.state === "unlocked" && settings.autoBackupHours !== 0,
    JSON.stringify([status?.vaultPath, settings.autoBackupHours, settings.autoBackupDirectory]),
    api.autoBackup,
    () => setError(t("自动备份失败，请检查备份目录和磁盘空间；软件运行期间会自动重试。")),
  );

  const applyTheme = useCallback((theme: ThemePreference) => {
    document.documentElement.dataset.theme = theme;
  }, []);

  useEffect(() => {
    api
      .vaultStatus()
      .then(setStatus)
      .catch((reason) => {
        setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
        setStatus({
          state: "uninitialized",
          systemUnlockAvailable: false,
          systemUnlockEnabled: false,
        });
      });
  }, [t]);

  const loadIndex = useCallback(async () => {
    const [all, projectRows, folderRows, graphRows, loadedSettings] = await Promise.all([
      api.listAssets({ includeDeleted: true }),
      api.listProjects(),
      api.listFolders(),
      api.graphData(),
      api.getSettings(),
    ]);
    setAssetsIndex(all);
    setProjects(projectRows);
    setFolders(folderRows);
    setGraph(graphRows);
    setSettings(loadedSettings);
    applyTheme(loadedSettings.theme);
    setPreference(loadedSettings.language);
    setIndexLoaded(true);
  }, [applyTheme, setPreference]);

  const loadVisible = useCallback(async () => {
    const requestId = ++visibleRequest.current;
    if (status?.state !== "unlocked" || navigation.view !== "assets") return;
    const rows = await api.listAssets({
      query: query || undefined,
      kind: navigation.kind,
      folderId: navigation.folderId,
      favoritesOnly: navigation.favorites,
      includeDeleted: navigation.trash,
    });
    if (requestId === visibleRequest.current) {
      let visible = navigation.trash
        ? rows.filter((item) => item.deletedAt)
        : rows.filter((item) => !item.deletedAt);
      if (navigation.expiring) {
        visible = collectExpiringAssets(visible, today, settings.expiryReminderDays);
      }
      setVisibleAssets(visible);
    }
  }, [navigation, query, settings.expiryReminderDays, status?.state, today]);

  useEffect(() => {
    if (status?.state === "unlocked")
      loadIndex().catch((reason) => setError(errorMessage(reason, t("操作没有完成，请重试。"), t)));
  }, [loadIndex, status?.state, t]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        loadVisible().catch((reason) =>
          setError(errorMessage(reason, t("操作没有完成，请重试。"), t)),
        ),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [loadVisible, t]);

  useEffect(() => {
    if (!selectedId || status?.state !== "unlocked") {
      setDetail(null);
      return;
    }
    let current = true;
    setDetail(null);
    api
      .getAsset(selectedId)
      .then((result) => {
        if (current) setDetail(result);
      })
      .catch((reason) => {
        if (current) {
          setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
          setSelectedId(undefined);
        }
      });
    return () => {
      current = false;
    };
  }, [selectedId, status?.state, t]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (navigation.view === "assets") {
          document.getElementById(assetSearchId)?.focus();
        }
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [assetSearchId, navigation.view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayIso()), 3_600_000);
    return () => window.clearInterval(timer);
  }, []);

  const expiringAssets = useMemo(
    () => collectExpiringAssets(assetsIndex, today, settings.expiryReminderDays),
    [assetsIndex, settings.expiryReminderDays, today],
  );

  // One expiry reminder per unlock, raised only after the asset index reloads.
  const expiryReminderShown = useRef(false);
  useEffect(() => {
    if (status?.state !== "unlocked") {
      expiryReminderShown.current = false;
      return;
    }
    if (!indexLoaded || expiryReminderShown.current) return;
    expiryReminderShown.current = true;
    if (expiringAssets.length > 0) {
      setToast(t("提醒：{count} 个凭证已过期或即将到期", { count: expiringAssets.length }));
    }
  }, [expiringAssets.length, indexLoaded, status?.state, t]);

  const lock = useCallback(async () => {
    try {
      const next = await api.lockVault();
      setAutomaticSystemUnlock(false);
      setStatus(next);
      setAssetsIndex([]);
      setVisibleAssets([]);
      setIndexLoaded(false);
      setDetail(null);
      setSelectedId(undefined);
    } catch (reason) {
      setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
    }
  }, [t]);
  useAutoLock(settings.autoLockMinutes, status?.state === "unlocked", lock);

  const refresh = useCallback(
    async (preferredId?: string) => {
      await loadIndex();
      await loadVisible();
      if (preferredId) {
        if (preferredId !== selectedId) setDetail(null);
        setSelectedId(preferredId);
        if (preferredId === selectedId) setDetail(await api.getAsset(preferredId));
      } else if (selectedId) {
        try {
          setDetail(await api.getAsset(selectedId));
        } catch {
          setSelectedId(undefined);
          setDetail(null);
        }
      }
    },
    [loadIndex, loadVisible, selectedId],
  );

  const run = async (operation: () => Promise<void>, success?: string, showGlobalError = true) => {
    busyOperations.current += 1;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (success) setToast(success);
    } catch (reason) {
      if (showGlobalError) setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
      throw reason;
    } finally {
      busyOperations.current = Math.max(0, busyOperations.current - 1);
      if (busyOperations.current === 0) setBusy(false);
    }
  };

  const initialize = async (
    vaultPath: string,
    password: string,
  ): Promise<InitializeVaultResult> => {
    let result: InitializeVaultResult | undefined;
    await run(async () => {
      result = await api.initializeVault(vaultPath, password);
      setStatus(result.status);
      setRecoveryRotated(false);
      setRecoveryKey(result.recoveryKey);
    });
    return result as InitializeVaultResult;
  };
  const unlock = async (password: string, useRecovery: boolean) =>
    run(async () => setStatus(await api.unlockVault(password, useRecovery)));
  const unlockSystem = async () => run(async () => setStatus(await api.unlockWithSystem()));
  const restoreBackup = async (
    backupPath: string,
    targetPath: string,
    credential: string,
    useRecovery: boolean,
  ) =>
    run(
      async () =>
        setStatus(await api.restoreBackup(backupPath, targetPath, credential, useRecovery)),
      t("凭证库已恢复"),
    );

  const saveAsset = async (
    input: AssetInput,
    sourcePath?: string,
    onPersisted?: (id: string) => void,
  ) =>
    run(
      async () => {
        const saved = await api.saveAsset(input);
        onPersisted?.(saved.summary.id);
        if (sourcePath) {
          await api.addAttachment(
            saved.summary.id,
            sourcePath,
            input.fields.find((field) => field.key === "passphrase")?.value || "",
            input.expiresAt || undefined,
          );
        }
        setEditor(false);
        await refresh(saved.summary.id);
      },
      input.id ? t("凭证已更新") : t("凭证已保存"),
    );

  const saveGeneratorRules = async (rules: PasswordGeneratorOptions) =>
    run(
      async () => setSettings(await api.saveSettings({ ...settings, passwordGenerator: rules })),
      undefined,
      false,
    );

  const editAsset = async (id: string) =>
    run(async () => {
      const [input, detail] = await Promise.all([api.getAssetForEdit(id), api.getAsset(id)]);
      setEditor({
        ...input,
        links: { relations: detail.assetRelations, bindings: detail.bindings },
      });
    });
  // save_asset rewrites the whole row, so the toggle must round-trip the full
  // edit input instead of saving from the list summary.
  const toggleAssetFavorite = (id: string, favorite: boolean) =>
    run(
      async () => {
        const input = await api.getAssetForEdit(id);
        await api.saveAsset({ ...input, favorite });
        await refresh(id);
      },
      favorite ? t("已星标") : t("已取消星标"),
    );
  const mutateAsset = async (operation: () => Promise<void>, message: string) =>
    run(async () => {
      await operation();
      await refresh();
    }, message);

  const saveProject = async (input: ProjectInput) =>
    run(
      async () => {
        const saved = await api.saveProject(input);
        await loadIndex();
        setNavigation({ view: "projects", projectId: saved.id });
      },
      input.id ? t("产品已更新") : t("产品已建立"),
    );
  const deleteProject = async (id: string) =>
    run(async () => {
      await api.deleteProject(id);
      await loadIndex();
      setNavigation({ view: "projects" });
    }, t("产品已删除"));
  const saveService = async (input: ServiceInput) =>
    run(async () => {
      await api.saveService(input);
      await loadIndex();
    }, t("产品组成已保存"));
  const deleteService = async (id: string) =>
    run(async () => {
      await api.deleteService(id);
      await loadIndex();
    }, t("产品组成已删除"));
  const saveEnvironment = async (input: EnvironmentInput) =>
    run(async () => {
      await api.saveEnvironment(input);
      await loadIndex();
    }, t("部署环境已保存"));
  const deleteEnvironment = async (id: string) =>
    run(async () => {
      await api.deleteEnvironment(id);
      await loadIndex();
    }, t("部署环境已删除"));
  const saveFolder = async (input: FolderInput) =>
    run(async () => {
      await api.saveFolder(input);
      await loadIndex();
    }, t("文件夹已保存"));
  const deleteFolder = async (id: string) =>
    run(async () => {
      await api.deleteFolder(id);
      await loadIndex();
      setNavigation({ view: "assets" });
    }, t("文件夹已删除，凭证仍保留"));

  const title = useMemo(() => {
    if (navigation.view !== "assets") return "";
    if (navigation.trash) return t("回收站");
    if (navigation.expiring) return t("即将过期");
    if (navigation.favorites) return t("星标收藏");
    if (navigation.kind) return t(KIND_LABELS[navigation.kind]);
    if (navigation.folderId)
      return folders.find((folder) => folder.id === navigation.folderId)?.name || t("文件夹");
    return t("全部凭证");
  }, [folders, navigation, t]);

  const workspaceTitle =
    navigation.view === "assets"
      ? title
      : navigation.view === "projects"
        ? t("产品")
        : t("关系图谱");

  const cycleTheme = async () => {
    const previous = settings;
    const systemIsDark =
      settings.theme === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
    const next = settings.theme === "dark" || systemIsDark ? "light" : "dark";
    const changed = { ...settings, theme: next as ThemePreference };
    setSettings(changed);
    applyTheme(changed.theme);
    try {
      const saved = await api.saveSettings(changed);
      setSettings(saved);
    } catch (reason) {
      setSettings(previous);
      applyTheme(previous.theme);
      setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
    }
  };

  const openGraphNode = (node: GraphNode) => {
    if (node.nodeType === "asset") {
      setSelectedId(node.id);
      return;
    }
    if (node.nodeType === "platform") {
      setQuery(node.label);
      setNavigation({ view: "assets" });
      return;
    }
    const projectId =
      node.nodeType === "project"
        ? node.id
        : projects.find(
            (project) =>
              project.services.some((service) => service.id === node.id) ||
              project.environments.some((environment) => environment.id === node.id),
          )?.id;
    if (projectId) setNavigation({ view: "projects", projectId });
  };

  if (!status) {
    return (
      <div className="app-loading">
        <span className="brand-loader" />
        <p>{t("正在打开凭证库…")}</p>
      </div>
    );
  }

  if (status.state !== "unlocked") {
    return (
      <VaultGate
        status={status}
        automaticSystemUnlock={automaticSystemUnlock}
        busy={busy}
        error={error}
        onInitialize={initialize}
        onUnlock={unlock}
        onSystemUnlock={unlockSystem}
        onRestore={restoreBackup}
      />
    );
  }

  return (
    <div className="app-shell" aria-busy={busy}>
      <a className="skip-link" href={`#${mainContentId}`}>
        {t("跳到主要内容")}
      </a>
      <Sidebar
        assets={assetsIndex}
        projects={projects}
        folders={folders}
        active={navigation}
        expiringCount={expiringAssets.length}
        onSaveFolder={saveFolder}
        onDeleteFolder={deleteFolder}
        onNavigate={(target) => {
          setNavigation(target);
          setQuery("");
          setSelectedId(undefined);
        }}
      />
      <main className="workspace" id={mainContentId}>
        {busy && <span className="busy-bar" aria-hidden="true" />}
        <header className="topbar">
          <div className="workspace-context">
            <span>{t("凭证库")}</span>
            <strong>{workspaceTitle}</strong>
          </div>
          <div className="topbar__status">
            <span className="offline-pill">
              <i />
              {t("仅本地")}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => void cycleTheme()}
              aria-label={t("切换主题")}
            >
              <SunMoon size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("设置")}
            >
              <Settings size={17} />
            </button>
            <button type="button" className="lock-button" onClick={lock}>
              <LockKeyhole size={15} />
              {t("锁定")}
            </button>
          </div>
        </header>
        {navigation.view === "assets" && (
          <div className="asset-workspace">
            <AssetList
              title={title}
              assets={visibleAssets}
              selectedId={selectedId}
              query={query}
              searchInputId={assetSearchId}
              expiryReminderDays={settings.expiryReminderDays}
              emptyTitle={navigation.expiring ? t("没有已过期或即将到期的凭证") : undefined}
              onQueryChange={setQuery}
              onSelect={setSelectedId}
              onCreate={() => setEditor(navigation.kind ? emptyAsset(navigation.kind) : null)}
              onCopy={(assetId, fieldKey) =>
                run(async () => {
                  await api.copySecret(assetId, fieldKey);
                  setToast(
                    t("已复制，{seconds} 秒后自动清除", {
                      seconds: settings.clipboardSeconds,
                    }),
                  );
                })
              }
            />
          </div>
        )}
        {navigation.view === "projects" && (
          <ProjectPanel
            projects={projects}
            selectedId={navigation.projectId}
            onSelect={(id) => setNavigation({ view: "projects", projectId: id })}
            onOpenAsset={setSelectedId}
            onSave={saveProject}
            onDelete={deleteProject}
            onSaveService={saveService}
            onDeleteService={deleteService}
            onSaveEnvironment={saveEnvironment}
            onDeleteEnvironment={deleteEnvironment}
          />
        )}
        {navigation.view === "graph" && (
          <GraphView
            data={graph}
            focusId={graphFocus}
            onFocus={setGraphFocus}
            onOpenNode={openGraphNode}
          />
        )}
      </main>
      {selectedId && (
        <DetailPanel
          key={selectedId}
          detail={detail}
          loadingTitle={
            visibleAssets.find((asset) => asset.id === selectedId)?.title ||
            assetsIndex.find((asset) => asset.id === selectedId)?.title
          }
          assets={assetsIndex}
          projects={projects}
          busy={busy}
          revealSeconds={settings.revealSeconds}
          onClose={() => setSelectedId(undefined)}
          onShowGraph={(id) => {
            setGraphFocus(id);
            setNavigation({ view: "graph" });
          }}
          onReveal={async (assetId, fieldKey) => {
            setError("");
            try {
              return await api.revealSecret(assetId, fieldKey);
            } catch (reason) {
              setError(errorMessage(reason, t("操作没有完成，请重试。"), t));
              throw reason;
            }
          }}
          onCopy={(assetId, fieldKey) =>
            run(async () => {
              await api.copySecret(assetId, fieldKey);
              setToast(
                t("已复制，{seconds} 秒后自动清除", {
                  seconds: settings.clipboardSeconds,
                }),
              );
            })
          }
          onEdit={editAsset}
          onToggleFavorite={toggleAssetFavorite}
          onTrash={(id) => mutateAsset(() => api.trashAsset(id), t("已移入回收站"))}
          onRestore={(id) => mutateAsset(() => api.restoreAsset(id), t("凭证已恢复"))}
          onPurge={(id) => mutateAsset(() => api.purgeAsset(id), t("凭证已永久删除"))}
          onAddAttachment={(assetId, path) =>
            mutateAsset(
              () => api.addAttachment(assetId, path, "").then(() => undefined),
              t("文件已保存"),
            )
          }
          onExportAttachment={(id, path) =>
            run(() => api.exportAttachment(id, path), t("文件已导出"))
          }
          onDeleteAttachment={(id) => mutateAsset(() => api.deleteAttachment(id), t("文件已删除"))}
          onSaveBinding={(input: UsageBindingInput) =>
            mutateAsset(() => api.saveBinding(input).then(() => undefined), t("产品关联已建立"))
          }
          onDeleteBinding={(id) => mutateAsset(() => api.deleteBinding(id), t("关联已删除"))}
          onSaveAssetRelation={(input: AssetRelationInput) =>
            mutateAsset(
              () => api.saveAssetRelation(input).then(() => undefined),
              t("凭证关系已建立"),
            )
          }
          onDeleteAssetRelation={(id) =>
            mutateAsset(() => api.deleteAssetRelation(id), t("凭证关系已删除"))
          }
        />
      )}
      {editor !== false && (
        <AssetEditor
          initial={editor}
          projects={projects}
          assets={assetsIndex}
          folders={folders}
          generatorRules={settings.passwordGenerator}
          onGeneratorRulesSave={saveGeneratorRules}
          onCancel={() => setEditor(false)}
          onSave={saveAsset}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          systemUnlockAvailable={status.systemUnlockAvailable}
          systemUnlockEnabled={status.systemUnlockEnabled}
          onClose={() => setSettingsOpen(false)}
          onSave={async (next) =>
            run(
              async () => {
                const saved = await api.saveSettings(next);
                setSettings(saved);
                applyTheme(saved.theme);
                setPreference(saved.language);
              },
              undefined,
              false,
            )
          }
          onExportBackup={(path) => run(() => api.exportBackup(path), undefined, false)}
          onToggleSystemUnlock={async (enabled) =>
            run(
              async () =>
                setStatus(
                  enabled ? await api.enableSystemUnlock() : await api.disableSystemUnlock(),
                ),
              undefined,
              false,
            )
          }
          onRotateRecovery={async () =>
            run(
              async () => {
                const key = await api.rotateRecoveryKey();
                setRecoveryRotated(true);
                setRecoveryKey(key);
              },
              undefined,
              false,
            )
          }
          onChangePassword={(currentPassword, nextPassword) =>
            run(() => api.changeMasterPassword(currentPassword, nextPassword), undefined, false)
          }
        />
      )}
      {recoveryKey && (
        <RecoveryKeyDialog
          recoveryKey={recoveryKey}
          rotated={recoveryRotated}
          onDone={() => setRecoveryKey("")}
        />
      )}
      {toast && (
        <output className="toast" aria-live="polite">
          {toast}
        </output>
      )}
      {error && (
        <div className="global-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>
            {t("关闭")}
          </button>
        </div>
      )}
    </div>
  );
}
