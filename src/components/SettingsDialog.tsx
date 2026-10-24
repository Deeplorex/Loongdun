import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  BookOpen,
  Fingerprint,
  FolderOpen,
  KeyRound,
  Languages,
  LoaderCircle,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { LegalDocumentId } from "../legal/legalDocuments";
import { useI18n } from "../lib/i18n";
import type { VaultSettings } from "../types";
import { LegalDialog } from "./LegalDialog";

interface SettingsDialogProps {
  settings: VaultSettings;
  systemUnlockAvailable: boolean;
  systemUnlockEnabled: boolean;
  onClose: () => void;
  onSave: (settings: VaultSettings) => Promise<void>;
  onExportBackup: (path: string) => Promise<void>;
  onToggleSystemUnlock: (enabled: boolean) => Promise<void>;
  onRotateRecovery: () => Promise<void>;
  onChangePassword: (currentPassword: string, nextPassword: string) => Promise<void>;
}

export function SettingsDialog({
  settings,
  systemUnlockAvailable,
  systemUnlockEnabled,
  onClose,
  onSave,
  onExportBackup,
  onToggleSystemUnlock,
  onRotateRecovery,
  onChangePassword,
}: SettingsDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"hello" | "save" | "backup" | "security" | null>(
    null,
  );
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !legalDocument) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, legalDocument, onClose]);

  const perform = async (
    operation: () => Promise<void>,
    success?: string,
    action: typeof busyAction = "security",
  ) => {
    setBusy(true);
    setBusyAction(action);
    setMessage(null);
    try {
      await operation();
      if (success) setMessage({ text: success, tone: "success" });
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason || t("未知错误"));
      setMessage({ text: t("操作未完成：{detail}", { detail }), tone: "error" });
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  };

  const saveSettings = () => perform(() => onSave(draft), t("设置已保存"), "save");
  const chooseBackupDirectory = () =>
    perform(
      async () => {
        const directory = await open({ directory: true, multiple: false });
        if (typeof directory === "string")
          setDraft((current) => ({ ...current, autoBackupDirectory: directory }));
      },
      undefined,
      "backup",
    );
  const backup = async () => {
    const path = await save({
      title: t("导出加密备份"),
      defaultPath: `loongdun-${new Date().toISOString().slice(0, 10)}.loongdun-backup`,
      filters: [{ name: "Loongdun Backup", extensions: ["loongdun-backup", "rhizome-backup"] }],
    });
    if (!path) return;
    await perform(() => onExportBackup(path), t("加密备份已写入所选位置"), "backup");
  };

  return (
    <>
      <div className="modal-backdrop">
        <section
          className="settings-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-busy={busy}
        >
          <header className="modal-head">
            <div>
              <h2 id={titleId}>{t("设置")}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t("关闭")}
              disabled={busy}
            >
              <X size={19} />
            </button>
          </header>
          <div className="settings-body">
            <section className="settings-section">
              <label className="field-group">
                <span>{t("关闭窗口时")}</span>
                <select
                  value={draft.closeBehavior ?? "exit"}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      closeBehavior: event.target.value as "exit" | "tray",
                    }))
                  }
                >
                  <option value="exit">{t("退出应用")}</option>
                  <option value="tray">{t("最小化到托盘")}</option>
                </select>
              </label>
              <p>{t("托盘运行时仍会自动锁定，可从托盘菜单打开或退出应用。")}</p>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <Sun size={18} />
                <div>
                  <h3>{t("外观")}</h3>
                  <p>{t("选择界面的明暗外观。")}</p>
                </div>
              </div>
              <div className="theme-picker">
                {(["system", "light", "dark"] as const).map((theme) => (
                  <button
                    type="button"
                    key={theme}
                    className={draft.theme === theme ? "active" : ""}
                    onClick={() => setDraft((current) => ({ ...current, theme }))}
                  >
                    {theme === "system" ? (
                      <>
                        <Sun size={15} />
                        <Moon size={15} />
                      </>
                    ) : theme === "light" ? (
                      <Sun size={17} />
                    ) : (
                      <Moon size={17} />
                    )}
                    <span>
                      {theme === "system"
                        ? t("跟随系统")
                        : theme === "light"
                          ? t("浅色")
                          : t("深色")}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <Languages size={18} />
                <div>
                  <h3>{t("语言")}</h3>
                  <p>{t("选择界面显示语言。")}</p>
                </div>
              </div>
              <div className="theme-picker language-picker">
                {(["system", "zh-CN", "en-US"] as const).map((language) => (
                  <button
                    type="button"
                    key={language}
                    className={draft.language === language ? "active" : ""}
                    onClick={() => setDraft((current) => ({ ...current, language }))}
                  >
                    <Languages size={17} />
                    <span>
                      {language === "system"
                        ? t("跟随系统语言")
                        : language === "zh-CN"
                          ? t("中文")
                          : t("英文")}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <ShieldCheck size={18} />
                <div>
                  <h3>{t("自动保护")}</h3>
                  <p>{t("一段时间未操作后自动锁定。")}</p>
                </div>
              </div>
              <div className="form-grid form-grid--three">
                <label>
                  <span>{t("自动锁定")}</span>
                  <select
                    name="auto-lock-minutes"
                    value={draft.autoLockMinutes}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        autoLockMinutes: Number(event.target.value),
                      }))
                    }
                  >
                    {[1, 5, 15, 30].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} {t("分钟")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("显示后自动隐藏")}</span>
                  <select
                    name="reveal-seconds"
                    value={draft.revealSeconds}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        revealSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    {[15, 30, 60].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} {t("秒")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("剪贴板清除")}</span>
                  <select
                    value={draft.clipboardSeconds}
                    name="clipboard-seconds"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        clipboardSeconds: Number(event.target.value),
                      }))
                    }
                  >
                    {[15, 30, 60].map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds} {t("秒")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <Fingerprint size={18} />
                <div>
                  <h3>Windows Hello</h3>
                  <p>
                    {systemUnlockAvailable
                      ? t("使用当前 Windows 用户快速解锁。")
                      : t("这台电脑暂不支持，可继续使用主密码。")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={!systemUnlockAvailable || busy}
                onClick={() =>
                  perform(
                    () => onToggleSystemUnlock(!systemUnlockEnabled),
                    systemUnlockEnabled ? t("快速解锁已关闭") : t("快速解锁已启用"),
                    "hello",
                  )
                }
              >
                {busyAction === "hello" ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Fingerprint size={16} />
                )}
                {busyAction === "hello"
                  ? t("等待 Windows Hello…")
                  : systemUnlockEnabled
                    ? t("关闭快速解锁")
                    : t("启用快速解锁")}
              </button>
              {busyAction === "hello" && (
                <output className="settings-progress">
                  {t("请在 Windows 安全窗口完成验证；取消后可立即重试。")}
                </output>
              )}
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <KeyRound size={18} />
                <div>
                  <h3>{t("修改主密码")}</h3>
                  <p>{t("修改后，已保存的凭证内容保持不变。")}</p>
                </div>
              </div>
              <div className="password-change">
                <label>
                  <span>{t("当前主密码")}</span>
                  <input
                    name="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("新主密码")}</span>
                  <input
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.target.value)}
                    placeholder={t("至少 10 位")}
                  />
                </label>
                <label>
                  <span>{t("确认新主密码")}</span>
                  <input
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    busy ||
                    nextPassword.length < 10 ||
                    nextPassword !== confirmPassword ||
                    !currentPassword
                  }
                  onClick={() =>
                    perform(async () => {
                      await onChangePassword(currentPassword, nextPassword);
                      setCurrentPassword("");
                      setNextPassword("");
                      setConfirmPassword("");
                    }, t("主密码已修改"))
                  }
                >
                  <KeyRound size={16} />
                  {t("修改主密码")}
                </button>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <Archive size={18} />
                <div>
                  <h3>{t("加密备份")}</h3>
                  <p>{t("备份文件已加密，恢复时需要主密码或恢复密钥。")}</p>
                </div>
              </div>
              <div className="form-grid form-grid--two">
                <label>
                  <span>{t("自动备份")}</span>
                  <select
                    value={draft.autoBackupHours ?? 24}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        autoBackupHours: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={0}>{t("关闭")}</option>
                    <option value={1}>{t("每小时")}</option>
                    <option value={24}>{t("每天")}</option>
                    <option value={168}>{t("每周")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("备份目录")}</span>
                  <div className="input-with-action backup-directory">
                    <input
                      readOnly
                      value={draft.autoBackupDirectory || t("凭证库内的 backups 文件夹")}
                      title={t("点击选择备份目录")}
                      aria-label={t("备份目录")}
                      onClick={chooseBackupDirectory}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("选择备份目录")}
                      disabled={busy}
                      onClick={chooseBackupDirectory}
                    >
                      <FolderOpen size={16} />
                    </button>
                  </div>
                </label>
              </div>
              <p>{t("仅在软件运行且凭证库解锁时自动备份；到期后下次解锁补做，不安装后台服务。")}</p>
              <p>{t("备份保留历史版本，不自动删除；建议选择其他本地磁盘以防原盘损坏。")}</p>
              <div className="settings-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDraft((current) => ({ ...current, autoBackupDirectory: "" }))}
                >
                  {t("使用默认目录")}
                </button>
                <button type="button" className="secondary-button" onClick={backup} disabled={busy}>
                  <Archive size={16} />
                  {t("导出 .loongdun-backup")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => perform(onRotateRecovery, t("新的恢复密钥已生成"))}
                  disabled={busy}
                >
                  <KeyRound size={16} />
                  {t("更换恢复密钥")}
                </button>
              </div>
            </section>
            <section className="settings-section">
              <div className="settings-section__head">
                <BookOpen size={18} />
                <div>
                  <h3>{t("关于与法律")}</h3>
                  <p>{t("查看隐私政策、用户协议和第三方开源许可。")}</p>
                </div>
              </div>
              <div className="settings-actions legal-entry-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLegalDocument("privacy")}
                >
                  {t("隐私政策")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLegalDocument("terms")}
                >
                  {t("用户协议")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLegalDocument("open-source")}
                >
                  {t("第三方开源许可")}
                </button>
              </div>
            </section>
            {message && (
              <output
                className={message.tone === "error" ? "inline-error" : "inline-success"}
                aria-live="polite"
                role={message.tone === "error" ? "alert" : "status"}
              >
                {message.text}
              </output>
            )}
          </div>
          <footer className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
              {t("关闭")}
            </button>
            <button type="button" className="primary-button" onClick={saveSettings} disabled={busy}>
              {busyAction === "save" ? t("正在保存…") : t("保存设置")}
            </button>
          </footer>
        </section>
      </div>
      {legalDocument && (
        <LegalDialog initialDocument={legalDocument} onClose={() => setLegalDocument(null)} />
      )}
    </>
  );
}
