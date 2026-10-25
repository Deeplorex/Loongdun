import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Project } from "../types";

const project = (id: string, name: string, updatedAt: string, favorite = false): Project => ({
  id,
  name,
  description: "",
  repoPath: "",
  favorite,
  updatedAt,
  services: [],
  environments: [],
  bindings: [],
});

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <Sidebar
      assets={[]}
      projects={[]}
      folders={[]}
      active={{ view: "assets" }}
      expiringCount={0}
      onNavigate={vi.fn()}
      onSaveFolder={vi.fn()}
      onDeleteFolder={vi.fn()}
      {...overrides}
    />,
  );
}

describe("sidebar navigation", () => {
  it("marks only the selected folder as active", () => {
    renderSidebar({
      folders: [{ id: "folder-1", parentId: null, name: "工作账号" }],
      active: { view: "assets", folderId: "folder-1" },
    });

    expect(screen.getByRole("button", { name: "全部凭证 0" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "工作账号" })).toHaveClass("active");
  });

  it("shows only three sidebar products, favorites first then recently updated", () => {
    renderSidebar({
      projects: [
        project("p1", "个人网站", "2026-09-01T00:00:00Z", true),
        project("p2", "照片备份", "2026-09-10T00:00:00Z"),
        project("p3", "视频栏目", "2026-09-05T00:00:00Z"),
        project("p4", "线上店铺", "2026-09-12T00:00:00Z"),
        project("p5", "自媒体品牌", "2026-09-08T00:00:00Z"),
      ],
    });

    expect(screen.getByRole("button", { name: "个人网站" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "线上店铺" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "照片备份" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "自媒体品牌" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "视频栏目" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部产品 5" })).toBeInTheDocument();
  });

  it("shows the expiring-soon entry with its badge count", () => {
    renderSidebar({ expiringCount: 3 });

    expect(screen.getByRole("button", { name: "即将过期 3" })).toBeInTheDocument();
  });

  it("marks the expiring-soon entry active and deactivates all credentials", () => {
    renderSidebar({ active: { view: "assets", expiring: true }, expiringCount: 3 });

    expect(screen.getByRole("button", { name: "即将过期 3" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "全部凭证 0" })).not.toHaveClass("active");
  });

  it("navigates to the expiring view when the entry is clicked", () => {
    const onNavigate = vi.fn();
    renderSidebar({ expiringCount: 2, onNavigate });

    fireEvent.click(screen.getByRole("button", { name: "即将过期 2" }));
    expect(onNavigate).toHaveBeenCalledWith({ view: "assets", expiring: true });
  });
});
