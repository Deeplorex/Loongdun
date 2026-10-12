import { open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyAsset, SERVER_AUTH_LABELS } from "../lib/assetTemplates";
import { api } from "../lib/commands";
import type { AssetInput } from "../types";
import { AssetEditor } from "./AssetEditor";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../lib/commands", () => ({ api: { generatePassword: vi.fn() } }));

describe("AssetEditor", () => {
  it("selects a key file and retains the saved asset ID when attachment import needs retry", async () => {
    vi.mocked(open).mockResolvedValue("D:/fixtures/test-key.pem");
    const onSave = vi.fn(
      async (_input: AssetInput, _path?: string, persisted?: (id: string) => void) => {
        persisted?.("saved-file-1");
        throw new Error("Import failed");
      },
    );
    render(
      <AssetEditor
        initial={emptyAsset("secret_file")}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "选择密钥或证书文件" }));
    expect(screen.getByText("test-key.pem")).toBeVisible();
    expect(screen.getByLabelText("名称 *")).toHaveValue("test-key.pem");
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));
    await screen.findByRole("alert");
    expect(onSave.mock.calls[0][1]).toBe("D:/fixtures/test-key.pem");
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].id).toBe("saved-file-1");
  });

  it("supports choosing files while editing and removing a pending selection", async () => {
    vi.mocked(open).mockResolvedValueOnce(null).mockResolvedValueOnce("D:/fixtures/test.pem");
    const initial = { ...emptyAsset("secret_file"), id: "file-1", title: "Existing key" };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AssetEditor initial={initial} assets={[]} folders={[]} onCancel={vi.fn()} onSave={onSave} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "选择密钥或证书文件" }));
    expect(screen.queryByRole("button", { name: "移除所选文件" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "选择密钥或证书文件" }));
    await userEvent.click(screen.getByRole("button", { name: "移除所选文件" }));
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));
    expect(onSave.mock.calls[0]).toHaveLength(1);
  });

  it("keeps type-specific standard fields fixed and adds editable custom fields separately", async () => {
    render(
      <AssetEditor
        initial={emptyAsset("web_account")}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("region", { name: "网站账号标准字段" })).toBeVisible();
    expect(screen.getByRole("group", { name: "资产类型" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "用户名" })).toBeVisible();
    expect(screen.getByLabelText("密码")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "登录 URL" })).toBeVisible();
    expect(screen.queryByLabelText("字段 1 名称")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除 用户名" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "添加自定义字段" }));
    expect(screen.getByLabelText("字段 7 名称")).toHaveValue("自定义字段");
    expect(screen.getByRole("heading", { name: "自定义字段" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除 自定义字段" })).toBeVisible();
  });

  it("locks the asset type while editing an existing credential", () => {
    const existing = emptyAsset("database");
    existing.id = "database-1";
    existing.title = "生产数据库";

    render(
      <AssetEditor
        initial={existing}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("group", { name: "资产类型" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "数据库标准字段" })).toBeVisible();
  });

  it("offers type-specific platform suggestions and normalizes common aliases", async () => {
    render(
      <AssetEditor
        initial={emptyAsset("api_credential")}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const platform = screen.getByRole("combobox", { name: /平台/ });
    const listId = platform.getAttribute("list");
    expect(listId).toBeTruthy();
    const suggestions = document.getElementById(listId || "");
    expect(suggestions?.querySelector('option[value="OpenAI"]')).toBeInTheDocument();
    expect(suggestions?.querySelector('option[value="DeepSeek"]')).toBeInTheDocument();
    expect(suggestions?.querySelector('option[value="阿里云"]')).toBeInTheDocument();

    await userEvent.type(platform, "aws");
    await userEvent.tab();
    expect(platform).toHaveValue("Amazon Web Services");
  });

  it("derives the list username and only asks for environment on deployment-bound assets", async () => {
    const account = emptyAsset("web_account");
    account.environment = "legacy-value";
    const onSave = vi.fn<(input: AssetInput) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AssetEditor initial={account} assets={[]} folders={[]} onCancel={vi.fn()} onSave={onSave} />,
    );

    expect(screen.queryByLabelText("用户名索引")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "环境" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "名称 *" }), "个人账号");
    await userEvent.type(screen.getByRole("textbox", { name: "用户名" }), "caozh@example.com");
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].usernameHint).toBe("caozh@example.com");
    expect(onSave.mock.calls[0][0].environment).toBe("");

    await userEvent.click(screen.getByRole("button", { name: "API 凭证" }));
    expect(screen.getByRole("combobox", { name: "环境" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "恢复凭证" }));
    expect(screen.queryByRole("combobox", { name: "环境" })).not.toBeInTheDocument();
  });

  it("uses dropdowns for standard categorical values", async () => {
    const onSave = vi.fn<(input: AssetInput) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AssetEditor
        initial={emptyAsset("database")}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    const engine = screen.getByRole("combobox", { name: "数据库类型" });
    const connectionMode = screen.getByRole("combobox", { name: "连接方式" });
    expect(screen.getByRole("textbox", { name: "名称 *" })).toHaveAttribute(
      "placeholder",
      "例如：家庭服务数据库",
    );
    expect(screen.getByRole("option", { name: "PostgreSQL" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "SSH 隧道" })).toBeInTheDocument();

    await userEvent.selectOptions(engine, "PostgreSQL");
    await userEvent.selectOptions(connectionMode, "TLS/SSL");
    await userEvent.type(screen.getByRole("textbox", { name: "名称 *" }), "业务数据库");
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "engine", value: "PostgreSQL" }),
        expect.objectContaining({ key: "connection_mode", value: "TLS/SSL" }),
      ]),
    );
  });

  it("keeps actions available and saves only the selected server login method", async () => {
    const onSave = vi.fn<(input: AssetInput) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AssetEditor
        initial={emptyAsset("server")}
        assets={[]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();
    expect(screen.getByRole("button", { name: "保存凭证" })).toBeVisible();
    expect(screen.getByLabelText("登录密码")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: SERVER_AUTH_LABELS.ssh_key }));
    expect(screen.queryByLabelText("登录密码")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SSH 私钥")).toBeInTheDocument();
    expect(screen.getByLabelText("密钥口令")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "名称 *" }), "生产服务器");
    await userEvent.type(screen.getByRole("textbox", { name: "登录用户名" }), "ubuntu");
    fireEvent.change(screen.getByLabelText("SSH 私钥"), {
      target: { value: "test-private-key" },
    });
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0];
    expect(saved.usernameHint).toBe("ubuntu");
    expect(saved.fields.find((item) => item.key === "auth_method")?.value).toBe(
      SERVER_AUTH_LABELS.ssh_key,
    );
    expect(saved.fields.some((item) => item.key === "private_key")).toBe(true);
    expect(saved.fields.some((item) => item.key === "password")).toBe(false);
  });

  it("generates a password into the field and persists the chosen rules", async () => {
    const mocked = vi.mocked(api.generatePassword);
    mocked.mockResolvedValue({ value: "Tr0ub4dor&3xample!", entropyBits: 128 });
    const generatorRules = {
      length: 24,
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: true,
      requireEachSet: true,
    };
    const onGeneratorRulesSave = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn<(input: AssetInput) => Promise<void>>().mockResolvedValue(undefined);
    render(
      <AssetEditor
        initial={emptyAsset("web_account")}
        assets={[]}
        folders={[]}
        generatorRules={generatorRules}
        onGeneratorRulesSave={onGeneratorRulesSave}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    // Only the user-chosen password field offers generation, not provider-issued secrets.
    expect(screen.getAllByRole("button", { name: "生成密码" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "生成密码" }));
    expect(mocked).toHaveBeenCalledWith(generatorRules);
    expect(await screen.findByText("Tr0ub4dor&3xample!")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "生成并填入" }));
    expect(screen.getByLabelText("密码")).toHaveValue("Tr0ub4dor&3xample!");
    expect(onGeneratorRulesSave).toHaveBeenCalledWith(generatorRules);
    expect(screen.queryByText("Tr0ub4dor&3xample!")).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "名称 *" }), "个人账号");
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "password", value: "Tr0ub4dor&3xample!" }),
      ]),
    );
  });
});
