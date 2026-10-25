import { fireEvent, render, screen, within } from "@testing-library/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VaultSettings } from "../types";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

const settings: VaultSettings = {
  theme: "dark",
  language: "system",
  expiryReminderDays: 7,
  autoLockMinutes: 5,
  revealSeconds: 30,
  clipboardSeconds: 30,
};

describe("settings dialog", () => {
  it("saves the selected appearance and protection settings with a visible footer action", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={vi.fn()}
        onSave={onSave}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "浅色" }));
    await userEvent.click(screen.getByRole("button", { name: "英文" }));
    await userEvent.selectOptions(screen.getByLabelText("自动锁定"), "15");
    expect(screen.getByLabelText("关闭窗口时")).toHaveValue("exit");
    await userEvent.selectOptions(screen.getByLabelText("关闭窗口时"), "tray");
    expect(screen.getByLabelText("自动备份")).toHaveValue("24");
    await userEvent.selectOptions(screen.getByLabelText("自动备份"), "168");
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(onSave).toHaveBeenCalledWith({
      ...settings,
      autoBackupHours: 168,
      theme: "light",
      language: "en-US",
      autoLockMinutes: 15,
      closeBehavior: "tray",
    });
    expect(await screen.findByText("设置已保存")).toBeInTheDocument();
    expect(screen.queryByText(/Vault Key|轮换/)).not.toBeInTheDocument();
  });

  it("saves the expiry reminder window, including turning it off", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={vi.fn()}
        onSave={onSave}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("提前提醒");
    expect(select).toHaveValue("7");
    await userEvent.selectOptions(select, "30");
    await userEvent.selectOptions(select, "0");
    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expiryReminderDays: 0 }));
  });

  it("lets the user pick a backup folder from the backup directory field", async () => {
    vi.mocked(openDialog).mockResolvedValue("D:/backups/loongdun");
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={vi.fn()}
        onSave={onSave}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("备份目录")).toHaveValue("凭证库内的 backups 文件夹");
    await userEvent.click(screen.getByLabelText("备份目录"));
    expect(openDialog).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(screen.getByLabelText("备份目录")).toHaveValue("D:/backups/loongdun");

    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoBackupDirectory: "D:/backups/loongdun" }),
    );
  });

  it("shows the backup schedule and retention hints in the backup section", () => {
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    expect(
      screen.getByText("仅在软件运行且凭证库解锁时自动备份；到期后下次解锁补做，不安装后台服务。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("备份保留历史版本，不自动删除；建议选择其他本地磁盘以防原盘损坏。"),
    ).toBeInTheDocument();
  });

  it("closes with Escape when no operation is running", () => {
    const onClose = vi.fn();
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={onClose}
        onSave={vi.fn()}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens each legal document without closing the settings dialog", async () => {
    const onClose = vi.fn();
    render(
      <SettingsDialog
        settings={settings}
        systemUnlockAvailable
        systemUnlockEnabled={false}
        onClose={onClose}
        onSave={vi.fn()}
        onExportBackup={vi.fn()}
        onToggleSystemUnlock={vi.fn()}
        onRotateRecovery={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "隐私政策" }));
    const legalDialog = screen.getAllByRole("dialog")[1];
    expect(within(legalDialog).getByRole("heading", { name: "隐私政策" })).toBeInTheDocument();
    expect(within(legalDialog).getByText(/不向发布者收集、上传或出售/)).toBeInTheDocument();

    await userEvent.click(within(legalDialog).getByRole("button", { name: "用户协议" }));
    expect(within(legalDialog).getByRole("heading", { name: "用户协议" })).toBeInTheDocument();

    await userEvent.click(within(legalDialog).getByRole("button", { name: "第三方开源许可" }));
    expect(within(legalDialog).getByText("SQLCipher")).toBeInTheDocument();
    expect(within(legalDialog).getAllByText("Apache-2.0", { exact: true }).length).toBeGreaterThan(
      0,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "第三方开源许可" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
