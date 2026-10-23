import { open } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Fingerprint,
  FolderOpen,
  GitBranch,
  HardDrive,
  KeyRound,
  LoaderCircle,
  Shield,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { InitializeVaultResult, VaultStatus } from "../types";
import { Brand } from "./Brand";

interface VaultGateProps {
  status: VaultStatus;
  automaticSystemUnlock?: boolean;
  busy: boolean;
  error: string;
  onInitialize: (path: string, password: string) => Promise<InitializeVaultResult>;
  onUnlock: (password: string, useRecovery: boolean) => Promise<void>;
  onSystemUnlock: () => Promise<void>;
  onRestore: (
    backupPath: string,
    targetPath: string,
    credential: string,
    useRecovery: boolean,
  ) => Promise<void>;
}

export function VaultGate({
  status,
  automaticSystemUnlock = true,
  busy,
  error,
  onInitialize,
  onUnlock,
  onSystemUnlock,
  onRestore,
}: VaultGateProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const suggestedVaultPath = status.vaultPath || status.defaultVaultPath || "";
  const [vaultPath, setVaultPath] = useState(suggestedVaultPath);
  const [useRecovery, setUseRecovery] = useState(false);
  const [restoreMode, setRestoreMode] = useState(false);
  const [backupPath, setBackupPath] = useState("");
  const automaticSystemUnlockStarted = useRef(false);

  useEffect(() => {
    if (suggestedVaultPath) setVaultPath(suggestedVaultPath);
  }, [suggestedVaultPath]);

  useEffect(() => {
    if (
      status.state !== "locked" ||
      !automaticSystemUnlock ||
      !status.systemUnlockEnabled ||
      restoreMode ||
      busy ||
      automaticSystemUnlockStarted.current
    ) {
      return;
    }
    automaticSystemUnlockStarted.current = true;
    void onSystemUnlock().catch(() => undefined);
  }, [
    automaticSystemUnlock,
    busy,
    onSystemUnlock,
    restoreMode,
    status.state,
    status.systemUnlockEnabled,
  ]);

  const chooseDirectory = async () => {
    const selection = await open({
      directory: true,
      multiple: false,
      title: t("选择保存位置"),
    });
    if (typeof selection === "string") setVaultPath(selection);
  };

  const chooseBackup = async () => {
    const selection = await open({
      multiple: false,
      title: t("选择 Rhizome 加密备份"),
      filters: [{ name: "Rhizome Backup", extensions: ["rhizome-backup"] }],
    });
    if (typeof selection === "string") setBackupPath(selection);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (restoreMode) {
        await onRestore(backupPath, vaultPath, password, useRecovery);
        setPassword("");
        return;
      }
      if (status.state === "uninitialized") {
        if (password !== confirm) return;
        await onInitialize(vaultPath, password);
        setConfirm("");
      } else {
        await onUnlock(password, useRecovery);
      }
      setPassword("");
    } catch {
      // The shell renders the sanitized application error and restores the busy state.
    }
  };

  const initializing = status.state === "uninitialized";
  const title = restoreMode ? t("恢复凭证库") : initializing ? t("创建凭证库") : t("欢迎回来");
  const intro = restoreMode
    ? t("选择备份文件和新的保存位置，再输入原主密码或恢复密钥。")
    : initializing
      ? t("集中保存长期使用的账号、密钥和凭证文件，数据只留在这台电脑上。")
      : t("凭证库已锁定。验证后继续使用。");

  return (
    <main className="gate-shell">
      <div className="gate-shell__grain" />
      <section className="gate-story" aria-label={t("Rhizome 产品介绍")}>
        <Brand />
        <div className="gate-story__copy">
          <h1>
            {t("把密码和密钥，")}
            <br />
            {t("安心收在一处。")}
          </h1>
          <p>{t("保存长期使用的凭证，也记住它们属于哪里、被哪些产品使用。")}</p>
        </div>
        <ul className="gate-benefits">
          <li>
            <HardDrive size={17} />
            <span>
              <strong>{t("只在本机")}</strong>
              <small>{t("凭证和文件均加密保存")}</small>
            </span>
          </li>
          <li>
            <GitBranch size={17} />
            <span>
              <strong>{t("看清依赖")}</strong>
              <small>{t("更换密钥前查看所有使用位置")}</small>
            </span>
          </li>
        </ul>
        <p className="gate-story__foot">
          <Shield size={14} /> {t("数据只保存在本机")}
        </p>
      </section>

      <section className="gate-panel">
        <form className="gate-card" onSubmit={submit}>
          <div className="gate-card__icon">
            <Fingerprint size={24} />
          </div>
          <h2>{title}</h2>
          <p className="gate-card__intro">{intro}</p>

          {(initializing || restoreMode) && (
            <div className="field-group">
              {restoreMode && (
                <label>
                  <span>{t("加密备份")}</span>
                  <div className="input-with-action">
                    <input
                      value={backupPath}
                      name="backup-path"
                      onChange={(event) => setBackupPath(event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={chooseBackup}
                      aria-label={t("选择备份")}
                    >
                      <ArchiveRestore size={17} />
                    </button>
                  </div>
                </label>
              )}
              <label>
                <span>{t("保存位置")}</span>
                <div className="input-with-action">
                  <input
                    value={vaultPath}
                    name="vault-path"
                    onChange={(event) => setVaultPath(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={chooseDirectory}
                    aria-label={t("选择目录")}
                  >
                    <FolderOpen size={17} />
                  </button>
                </div>
              </label>
            </div>
          )}

          <label className="field-group">
            <span>{useRecovery ? t("恢复密钥") : t("主密码")}</span>
            <input
              type="password"
              name={useRecovery ? "recovery-key" : "master-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={useRecovery ? 20 : 10}
              autoComplete={initializing ? "new-password" : "current-password"}
              required
            />
          </label>

          {initializing && !restoreMode && (
            <label className="field-group">
              <span>{t("再次输入主密码")}</span>
              <input
                type="password"
                name="master-password-confirmation"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={10}
                autoComplete="new-password"
                required
              />
              {confirm && password !== confirm && (
                <small className="field-error">{t("两次密码不一致")}</small>
              )}
            </label>
          )}

          {(status.state === "locked" || restoreMode) && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={useRecovery}
                onChange={(event) => setUseRecovery(event.target.checked)}
              />
              <span>{t("使用恢复密钥")}</span>
            </label>
          )}

          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}

          <button
            className="primary-button primary-button--wide"
            type="submit"
            disabled={busy || (initializing && password !== confirm)}
          >
            {busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
            {restoreMode ? t("验证并恢复") : initializing ? t("创建凭证库") : t("解锁凭证库")}
          </button>

          {status.state === "locked" && status.systemUnlockEnabled && !restoreMode && (
            <button
              className="secondary-button secondary-button--wide"
              type="button"
              onClick={() => void onSystemUnlock().catch(() => undefined)}
              disabled={busy}
            >
              <Fingerprint size={18} /> {t("使用 Windows Hello")}
            </button>
          )}

          <button
            className="text-button gate-card__restore"
            type="button"
            onClick={() => {
              setRestoreMode((value) => !value);
              setUseRecovery(false);
            }}
          >
            {restoreMode ? t("返回解锁") : t("从加密备份恢复")}
          </button>
        </form>
      </section>
    </main>
  );
}
