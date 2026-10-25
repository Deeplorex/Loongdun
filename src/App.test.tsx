import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { api } from "./lib/commands";

vi.mock("./lib/commands", () => ({
  api: {
    vaultStatus: vi.fn(),
    listAssets: vi.fn(),
    listProjects: vi.fn(),
    listFolders: vi.fn(),
    graphData: vi.fn(),
    autoBackup: vi.fn().mockResolvedValue(null),
    getSettings: vi.fn(),
    getAsset: vi.fn(),
    getAssetForEdit: vi.fn(),
    saveAsset: vi.fn(),
    lockVault: vi.fn(),
    unlockVault: vi.fn(),
    saveSettings: vi.fn(),
    enableSystemUnlock: vi.fn(),
    copySecret: vi.fn(),
  },
}));

const mocked = vi.mocked(api);

describe("Loongdun shell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete document.documentElement.dataset.theme;
    mocked.listAssets.mockResolvedValue([]);
    mocked.listProjects.mockResolvedValue([]);
    mocked.listFolders.mockResolvedValue([]);
    mocked.graphData.mockResolvedValue({ nodes: [], edges: [] });
    mocked.getSettings.mockResolvedValue({
      theme: "system",
      language: "system",
      expiryReminderDays: 7,
      autoLockMinutes: 5,
      revealSeconds: 30,
      clipboardSeconds: 30,
    });
    mocked.saveSettings.mockImplementation(async (settings) => settings);
  });

  it("switches directly from dark to light with one click", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    mocked.getSettings.mockResolvedValue({
      theme: "dark",
      language: "system",
      expiryReminderDays: 7,
      autoLockMinutes: 5,
      revealSeconds: 30,
      clipboardSeconds: 30,
    });

    render(<App />);
    await screen.findByRole("heading", { name: "全部凭证" });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    await userEvent.click(screen.getByRole("button", { name: "切换主题" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(mocked.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: "light" }));
  });

  it("shows the initialization gate when no vault exists", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "uninitialized",
      defaultVaultPath: "C:\\Users\\tester\\Documents\\Deeplorex\\Loongdun",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "创建凭证库" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "保存位置" })).toHaveValue(
      "C:\\Users\\tester\\Documents\\Deeplorex\\Loongdun",
    );
    expect(screen.getByText("数据只保存在本机")).toBeInTheDocument();
  });

  it("keeps the asset list primary and opens details only after a row is clicked", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    const asset = {
      id: "asset-1",
      kind: "server" as const,
      title: "生产服务器",
      platform: "阿里云",
      usernameHint: "root",
      environment: "Prod",
      favorite: false,
      updatedAt: "2026-09-02T12:00:00Z",
      tags: ["生产"],
      coreFields: [
        { key: "host", label: "IP / 域名", value: "10.0.0.8", sensitive: false },
        { key: "password", label: "密码", value: "••••••••", sensitive: true },
      ],
    };
    mocked.listAssets.mockResolvedValue([asset]);
    mocked.getAsset.mockResolvedValue({
      summary: asset,
      notes: "",
      fields: [],
      attachments: [],
      bindings: [],
      assetRelations: [],
      childAssets: [],
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "全部凭证" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(await screen.findByText("10.0.0.8")).toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "复制密码" }));
    expect(mocked.copySecret).toHaveBeenCalledWith("asset-1", "password");
    expect(screen.queryByRole("dialog", { name: "生产服务器 详情" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("textbox", { name: "搜索凭证" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "筛选与排序" }));
    expect(screen.getByRole("combobox", { name: "排序" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("combobox", { name: "排序" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "生产服务器 详情" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /生产服务器/ }));
    expect(await screen.findByRole("dialog", { name: "生产服务器 详情" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("button", { name: "在关系图中定位" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关闭详情" }));
    expect(screen.queryByRole("dialog", { name: "生产服务器 详情" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "关系图谱" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "关系图谱" })).toBeInTheDocument(),
    );
  });

  it("toggles the star from the detail panel without opening the editor", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    const asset = {
      id: "asset-1",
      kind: "server" as const,
      title: "生产服务器",
      platform: "阿里云",
      usernameHint: "root",
      environment: "Prod",
      favorite: false,
      updatedAt: "2026-09-02T12:00:00Z",
      tags: [],
      coreFields: [],
    };
    const detail = {
      summary: asset,
      notes: "",
      fields: [],
      attachments: [],
      bindings: [],
      assetRelations: [],
      childAssets: [],
    };
    const editInput = {
      id: "asset-1",
      kind: "server" as const,
      title: "生产服务器",
      platform: "阿里云",
      usernameHint: "root",
      environment: "Prod",
      notes: "",
      favorite: false,
      expiresAt: null,
      parentAssetId: null,
      folderId: null,
      tags: [],
      fields: [{ key: "host", label: "IP / 域名", value: "10.0.0.8", sensitive: false }],
    };
    mocked.listAssets.mockResolvedValue([asset]);
    mocked.getAsset.mockResolvedValue(detail);
    mocked.getAssetForEdit.mockResolvedValue(editInput);
    mocked.saveAsset.mockResolvedValue(detail);

    render(<App />);
    await screen.findByRole("heading", { name: "全部凭证" });
    await userEvent.click(await screen.findByRole("option", { name: /生产服务器/ }));
    await screen.findByRole("dialog", { name: "生产服务器 详情" });
    await userEvent.click(screen.getByRole("button", { name: "星标凭证" }));

    expect(mocked.getAssetForEdit).toHaveBeenCalledWith("asset-1");
    await waitFor(() =>
      expect(mocked.saveAsset).toHaveBeenCalledWith(
        expect.objectContaining({ id: "asset-1", favorite: true, fields: editInput.fields }),
      ),
    );
    expect(await screen.findByText("已星标")).toBeInTheDocument();
  });

  it("starts a new credential with the type selected in the sidebar", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });

    render(<App />);
    await screen.findByRole("heading", { name: "全部凭证" });
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "主导航" })).getByRole("button", {
        name: /数据库/,
      }),
    );
    await screen.findByRole("heading", { name: "数据库" });
    await userEvent.click(
      within(screen.getByRole("region", { name: "资产列表" })).getAllByRole("button", {
        name: "新建凭证",
      })[0],
    );

    const editor = screen.getByRole("dialog", { name: "新增凭证" });
    expect(within(editor).getByRole("button", { name: "数据库" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(editor).getByRole("region", { name: "数据库标准字段" })).toBeVisible();
  });

  it("recovers the settings controls when quick unlock fails", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    mocked.enableSystemUnlock.mockRejectedValue(new Error("Windows Hello 未完成"));
    render(<App />);
    await screen.findByRole("heading", { name: "全部凭证" });
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    const quickUnlock = screen.getByRole("button", { name: "启用快速解锁" });
    await userEvent.click(quickUnlock);
    expect(await screen.findByText(/操作未完成：Windows Hello 未完成/)).toHaveClass("inline-error");
    await waitFor(() => expect(quickUnlock).toBeEnabled());
  });

  it("reminds about expiring credentials once per unlock", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    mocked.listAssets.mockResolvedValue([
      {
        id: "asset-expired",
        kind: "api_credential" as const,
        title: "过期令牌",
        platform: "",
        usernameHint: "",
        environment: "",
        favorite: false,
        expiresAt: "2020-01-01",
        updatedAt: "2026-09-02T12:00:00Z",
        tags: [],
        coreFields: [],
      },
    ]);
    mocked.lockVault.mockResolvedValue({
      state: "locked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    mocked.unlockVault.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });

    render(<App />);
    expect(await screen.findByText("提醒：1 个凭证已过期或即将到期")).toBeInTheDocument();

    // The reminder clears on its own and is not raised again until a relock.
    await waitFor(
      () => expect(screen.queryByText("提醒：1 个凭证已过期或即将到期")).not.toBeInTheDocument(),
      { timeout: 4000 },
    );
    await userEvent.click(screen.getByRole("button", { name: "锁定" }));
    await userEvent.type(await screen.findByLabelText("主密码"), "test-password");
    await userEvent.click(screen.getByRole("button", { name: "解锁凭证库" }));
    expect(await screen.findByText("提醒：1 个凭证已过期或即将到期")).toBeInTheDocument();
  });

  it("explains that Windows Hello is awaiting the native verification window", async () => {
    mocked.vaultStatus.mockResolvedValue({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: false,
    });
    let finishHello:
      | ((value: Awaited<ReturnType<typeof api.enableSystemUnlock>>) => void)
      | undefined;
    mocked.enableSystemUnlock.mockReturnValue(
      new Promise((resolve) => {
        finishHello = resolve;
      }),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "全部凭证" });
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "启用快速解锁" }));

    expect(screen.getByRole("button", { name: "等待 Windows Hello…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("请在 Windows 安全窗口完成验证");

    finishHello?.({
      state: "unlocked",
      vaultPath: "D:\\LoongdunVault",
      systemUnlockAvailable: true,
      systemUnlockEnabled: true,
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "关闭快速解锁" })).toBeEnabled());
  });
});
