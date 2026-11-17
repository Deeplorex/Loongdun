import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyAsset } from "../lib/assetTemplates";
import type { AssetInput, AssetSummary, Project } from "../types";
import { AssetEditor } from "./AssetEditor";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const email: AssetSummary = {
  ...emptyAsset(),
  id: "email",
  title: "注册邮箱",
  updatedAt: "",
  coreFields: [],
};
const project: Project = {
  id: "p1",
  name: "AAA",
  description: "",
  repoPath: "",
  favorite: false,
  updatedAt: "",
  services: [{ id: "s1", projectId: "p1", name: "国内版小程序", description: "" }],
  environments: [{ id: "e1", projectId: "p1", serviceId: "s1", name: "生产", kind: "Prod" }],
  bindings: [],
};
describe("credential form relationships", () => {
  it("saves registration and a product environment together with the credential", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AssetEditor
        initial={{ ...emptyAsset(), title: "小程序" }}
        assets={[email]}
        projects={[project]}
        folders={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByText(/^关联 ·/));
    await userEvent.click(screen.getByRole("button", { name: "添加关联凭证" }));
    expect(screen.getByText("注册邮箱 → 用于注册 → 小程序")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "添加使用位置" }));
    const usage = screen.getByLabelText("使用位置 1");
    await userEvent.click(usage);
    await userEvent.type(usage, "生产");
    expect(screen.getByRole("option", { name: "AAA / 国内版小程序 / 生产" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "AAA" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "AAA / 国内版小程序 / 生产" }));
    await userEvent.click(screen.getByRole("button", { name: "保存凭证" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].links).toMatchObject({
      relations: [{ sourceAssetId: "email", targetAssetId: "", relationType: "used_to_register" }],
      bindings: [{ consumerKind: "environment", consumerId: "e1", environment: "Prod" }],
    });
  });

  it("loads existing links and discards removal when cancelled", async () => {
    const input: AssetInput = {
      ...emptyAsset(),
      id: "current",
      title: "小程序",
      links: {
        relations: [
          {
            sourceAssetId: "email",
            targetAssetId: "current",
            relationType: "used_to_register",
            notes: "registration",
          },
        ],
        bindings: [
          {
            assetId: "current",
            consumerKind: "project",
            consumerId: "p1",
            purpose: "",
            configKey: "",
            environment: "",
            notes: "",
          },
        ],
      },
    };
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <AssetEditor
        initial={input}
        assets={[email]}
        projects={[project]}
        folders={[]}
        onCancel={onCancel}
        onSave={onSave}
      />,
    );
    await userEvent.click(screen.getByText(/^关联 ·/));
    expect(screen.getByLabelText("关联凭证 1")).toHaveValue("注册邮箱");
    await userEvent.click(screen.getByRole("button", { name: "移除关联" }));
    await userEvent.click(screen.getByRole("button", { name: "移除使用位置" }));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(input.links?.relations).toHaveLength(1);
    expect(input.links?.bindings).toHaveLength(1);
  });
});
