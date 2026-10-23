import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetDetail, Project, UsageBinding } from "../types";
import { DetailPanel } from "./DetailPanel";

const detail: AssetDetail = {
  summary: {
    id: "asset-1",
    kind: "api_credential",
    title: "OpenAI API",
    platform: "OpenAI",
    usernameHint: "",
    environment: "Prod",
    favorite: false,
    updatedAt: "2026-09-02T12:00:00Z",
    tags: [],
    coreFields: [],
  },
  notes: "",
  fields: [
    {
      key: "token",
      label: "API Key",
      sensitive: true,
      hasValue: true,
    },
  ],
  attachments: [],
  bindings: [],
  assetRelations: [],
  childAssets: [],
};

const registrationEmail = {
  id: "asset-email",
  kind: "web_account" as const,
  title: "AAA 注册邮箱",
  platform: "QQ 邮箱",
  usernameHint: "owner@example.com",
  environment: "",
  favorite: false,
  updatedAt: "2026-09-02T12:00:00Z",
  tags: [],
  coreFields: [],
};

const projects: Project[] = [
  {
    id: "project-website",
    name: "个人网站",
    description: "",
    repoPath: "",
    favorite: false,
    updatedAt: "2026-09-02T12:00:00Z",
    services: [
      { id: "service-sync", projectId: "project-website", name: "作品同步", description: "" },
    ],
    environments: [
      {
        id: "environment-daily",
        projectId: "project-website",
        serviceId: "service-sync",
        name: "日常使用",
        kind: "prod",
      },
    ],
    bindings: [],
  },
];

function renderDetail(
  bindingDetail: AssetDetail,
  props: Partial<ComponentProps<typeof DetailPanel>> = {},
) {
  render(
    <DetailPanel
      detail={bindingDetail}
      assets={[bindingDetail.summary]}
      projects={projects}
      busy={false}
      revealSeconds={15}
      onClose={vi.fn()}
      onShowGraph={vi.fn()}
      onReveal={vi.fn()}
      onCopy={vi.fn()}
      onToggleFavorite={vi.fn()}
      onEdit={vi.fn()}
      onTrash={vi.fn()}
      onRestore={vi.fn()}
      onPurge={vi.fn()}
      onAddAttachment={vi.fn()}
      onExportAttachment={vi.fn()}
      onDeleteAttachment={vi.fn()}
      onSaveBinding={vi.fn()}
      onDeleteBinding={vi.fn()}
      onSaveAssetRelation={vi.fn()}
      onDeleteAssetRelation={vi.fn()}
      {...props}
    />,
  );
}

describe("asset detail", () => {
  afterEach(() => vi.useRealTimers());

  it("closes only when the area outside the detail panel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel
        detail={detail}
        assets={[detail.summary, registrationEmail]}
        projects={[]}
        busy={false}
        revealSeconds={15}
        onClose={onClose}
        onShowGraph={vi.fn()}
        onReveal={vi.fn()}
        onCopy={vi.fn()}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onTrash={vi.fn()}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onAddAttachment={vi.fn()}
        onExportAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onSaveBinding={vi.fn()}
        onDeleteBinding={vi.fn()}
        onSaveAssetRelation={vi.fn()}
        onDeleteAssetRelation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("使用位置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加关联" })).toBeInTheDocument();
    expect(screen.getByText("还没有使用位置")).toBeInTheDocument();
    expect(screen.queryByText("还没有下游使用方")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭资产详情" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides each revealed secret using the duration returned by Rust", async () => {
    vi.useFakeTimers();
    render(
      <DetailPanel
        detail={detail}
        assets={[detail.summary, registrationEmail]}
        projects={[]}
        busy={false}
        revealSeconds={15}
        onClose={vi.fn()}
        onShowGraph={vi.fn()}
        onReveal={vi.fn().mockResolvedValue({ value: "test-secret", expiresInSeconds: 15 })}
        onCopy={vi.fn()}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onTrash={vi.fn()}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onAddAttachment={vi.fn()}
        onExportAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onSaveBinding={vi.fn()}
        onDeleteBinding={vi.fn()}
        onSaveAssetRelation={vi.fn()}
        onDeleteAssetRelation={vi.fn()}
      />,
    );

    expect(screen.getByText("15 秒后隐藏")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "显示 API Key" }));
      await Promise.resolve();
    });
    expect(screen.getByText("test-secret")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.queryByText("test-secret")).not.toBeInTheDocument();
    expect(screen.getByText("••••••••••••")).toBeInTheDocument();
  });

  it("shows the full product path in the usage list", () => {
    const bindings: UsageBinding[] = [
      {
        id: "binding-service",
        assetId: "asset-1",
        assetTitle: "OpenAI API",
        consumerKind: "service",
        consumerId: "service-sync",
        consumerName: "作品同步",
        purpose: "读取公开仓库",
        configKey: "GITHUB_TOKEN",
        environment: "prod",
        notes: "",
        lastVerifiedAt: null,
      },
      {
        id: "binding-environment",
        assetId: "asset-1",
        assetTitle: "OpenAI API",
        consumerKind: "environment",
        consumerId: "environment-daily",
        consumerName: "日常使用",
        purpose: "",
        configKey: "",
        environment: "",
        notes: "",
        lastVerifiedAt: null,
      },
    ];
    renderDetail({ ...detail, bindings });

    expect(screen.getByText("个人网站 / 作品同步")).toBeInTheDocument();
    expect(screen.getByText("个人网站 / 作品同步 / 日常使用")).toBeInTheDocument();
    expect(screen.queryByText("作品同步")).not.toBeInTheDocument();
  });

  it("creates an incoming credential relationship with an explicit type", async () => {
    const onSaveAssetRelation = vi.fn().mockResolvedValue(undefined);
    render(
      <DetailPanel
        detail={detail}
        assets={[detail.summary, registrationEmail]}
        projects={[]}
        busy={false}
        revealSeconds={15}
        onClose={vi.fn()}
        onShowGraph={vi.fn()}
        onReveal={vi.fn()}
        onCopy={vi.fn()}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onTrash={vi.fn()}
        onRestore={vi.fn()}
        onPurge={vi.fn()}
        onAddAttachment={vi.fn()}
        onExportAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onSaveBinding={vi.fn()}
        onDeleteBinding={vi.fn()}
        onSaveAssetRelation={onSaveAssetRelation}
        onDeleteAssetRelation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "添加凭证关系" }));
    fireEvent.change(screen.getByRole("combobox", { name: "关系方向" }), {
      target: { value: "incoming" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "选择另一条凭证" }), {
      target: { value: registrationEmail.id },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "关系类型" }), {
      target: { value: "used_to_recover" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "关系备注（可选）" }), {
      target: { value: "用于找回小程序账号" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "建立凭证关系" }));
      await Promise.resolve();
    });

    expect(onSaveAssetRelation).toHaveBeenCalledWith({
      sourceAssetId: registrationEmail.id,
      targetAssetId: detail.summary.id,
      relationType: "used_to_recover",
      notes: "用于找回小程序账号",
    });
  });

  it("stars and unstars the credential from the detail header", async () => {
    const onToggleFavorite = vi.fn().mockResolvedValue(undefined);
    renderDetail(detail, { onToggleFavorite });

    const star = screen.getByRole("button", { name: "星标凭证" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await act(async () => {
      fireEvent.click(star);
      await Promise.resolve();
    });
    expect(onToggleFavorite).toHaveBeenCalledWith("asset-1", true);

    renderDetail({ ...detail, summary: { ...detail.summary, favorite: true } });
    expect(screen.getByRole("button", { name: "取消凭证星标" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
