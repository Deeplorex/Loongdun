import {
  AlarmClock,
  Archive,
  Boxes,
  Database,
  FileKey2,
  FolderPlus,
  FolderTree,
  Globe2,
  KeySquare,
  Network,
  Server,
  ShieldQuestion,
  Star,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { KIND_LABELS } from "../lib/assetTemplates";
import { useI18n } from "../lib/i18n";
import type { AssetKind, AssetSummary, Folder, FolderInput, Project } from "../types";
import { Brand } from "./Brand";
import { ProjectLogo } from "./ProjectLogo";

export type NavigationTarget =
  | {
      view: "assets";
      kind?: AssetKind;
      folderId?: string;
      favorites?: boolean;
      expiring?: boolean;
      trash?: boolean;
    }
  | { view: "projects"; projectId?: string }
  | { view: "graph" };

interface SidebarProps {
  assets: AssetSummary[];
  projects: Project[];
  folders: Folder[];
  active: NavigationTarget;
  expiringCount: number;
  onNavigate: (target: NavigationTarget) => void;
  onSaveFolder: (input: FolderInput) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
}

const kindIcons: Record<AssetKind, typeof Globe2> = {
  web_account: Globe2,
  api_credential: KeySquare,
  server: Server,
  database: Database,
  recovery: ShieldQuestion,
  secret_file: FileKey2,
};

export function Sidebar({
  assets,
  projects,
  folders,
  active,
  expiringCount,
  onNavigate,
  onSaveFolder,
  onDeleteFolder,
}: SidebarProps) {
  const { t } = useI18n();
  const [folderForm, setFolderForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderParent, setFolderParent] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const count = (kind: AssetKind) =>
    assets.filter((asset) => asset.kind === kind && !asset.deletedAt).length;
  const isAssets = active.view === "assets";

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <Brand compact />
      </div>
      <nav className="sidebar__nav" aria-label={t("主导航")}>
        <div className="nav-section">
          <p className="nav-section__label">{t("凭证库")}</p>
          <button
            type="button"
            className={
              isAssets &&
              !active.kind &&
              !active.folderId &&
              !active.favorites &&
              !active.expiring &&
              !active.trash
                ? "active"
                : ""
            }
            onClick={() => onNavigate({ view: "assets" })}
          >
            <Archive size={17} />
            <span>{t("全部凭证")}</span>
            <em>{assets.filter((item) => !item.deletedAt).length}</em>
          </button>
          <button
            type="button"
            className={isAssets && active.favorites ? "active" : ""}
            onClick={() => onNavigate({ view: "assets", favorites: true })}
          >
            <Star size={17} />
            <span>{t("星标收藏")}</span>
          </button>
          <button
            type="button"
            className={isAssets && active.expiring ? "active" : ""}
            onClick={() => onNavigate({ view: "assets", expiring: true })}
            title={t("到期提醒")}
          >
            <AlarmClock size={17} />
            <span>{t("即将过期")}</span>
            <em>{expiringCount || ""}</em>
          </button>
          <button
            type="button"
            className={active.view === "graph" ? "active" : ""}
            onClick={() => onNavigate({ view: "graph" })}
          >
            <Network size={17} />
            <span>{t("关系图谱")}</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section__label nav-section__label--row">
            <span>{t("文件夹")}</span>
            <button
              type="button"
              className="label-action"
              onClick={() => setFolderForm((value) => !value)}
              aria-label={t("新建文件夹")}
            >
              <FolderPlus size={14} />
            </button>
          </div>
          {folderForm && (
            <form
              className="folder-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setFolderSaving(true);
                try {
                  await onSaveFolder({ name: folderName, parentId: folderParent || null });
                  setFolderName("");
                  setFolderForm(false);
                } catch {
                  // The application-level error remains visible while the form stays open.
                } finally {
                  setFolderSaving(false);
                }
              }}
            >
              <input
                aria-label={t("文件夹名称")}
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={t("例如：工作账号")}
                name="folder-name"
                autoComplete="off"
                required
                disabled={folderSaving}
              />
              <select
                aria-label={t("上级文件夹")}
                value={folderParent}
                onChange={(event) => setFolderParent(event.target.value)}
                name="folder-parent"
                disabled={folderSaving}
              >
                <option value="">{t("根目录")}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={folderSaving || !folderName.trim()}>
                {folderSaving ? t("保存中…") : t("保存")}
              </button>
            </form>
          )}
          {folders.map((folder) => (
            <div className="folder-nav-row" key={folder.id}>
              <button
                type="button"
                className={isAssets && active.folderId === folder.id ? "active" : ""}
                onClick={() => onNavigate({ view: "assets", folderId: folder.id })}
              >
                <FolderTree size={16} />
                <span className="truncate">
                  {folder.parentId ? "↳ " : ""}
                  {folder.name}
                </span>
                <em>
                  {assets.filter((asset) => asset.folderId === folder.id && !asset.deletedAt)
                    .length || ""}
                </em>
              </button>
              <button
                type="button"
                className="folder-delete"
                aria-label={t("删除文件夹 {name}", { name: folder.name })}
                onClick={() => {
                  if (
                    window.confirm(
                      t("删除文件夹“{name}”？其中的凭证会保留为未归档。", {
                        name: folder.name,
                      }),
                    )
                  )
                    void onDeleteFolder(folder.id).catch(() => undefined);
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="nav-section">
          <p className="nav-section__label">{t("类型")}</p>
          {(Object.keys(KIND_LABELS) as AssetKind[]).map((kind) => {
            const Icon = kindIcons[kind];
            return (
              <button
                type="button"
                key={kind}
                className={isAssets && active.kind === kind ? "active" : ""}
                onClick={() => onNavigate({ view: "assets", kind })}
              >
                <Icon size={17} />
                <span>{t(KIND_LABELS[kind])}</span>
                <em>{count(kind)}</em>
              </button>
            );
          })}
        </div>

        <div className="nav-section">
          <div className="nav-section__label nav-section__label--row">
            <span>{t("产品")}</span>
            <button
              type="button"
              className="label-action"
              onClick={() => onNavigate({ view: "projects" })}
              aria-label={t("查看所有产品")}
            >
              <Boxes size={14} />
            </button>
          </div>
          <button
            type="button"
            className={active.view === "projects" && !active.projectId ? "active" : ""}
            onClick={() => onNavigate({ view: "projects" })}
          >
            <FolderTree size={17} />
            <span>{t("全部产品")}</span>
            <em>{projects.length}</em>
          </button>
          {[...projects]
            .sort((left, right) => {
              if (left.favorite !== right.favorite) return left.favorite ? -1 : 1;
              return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
            })
            .slice(0, 3)
            .map((project) => (
              <button
                type="button"
                key={project.id}
                className={
                  active.view === "projects" && active.projectId === project.id ? "active" : ""
                }
                onClick={() => onNavigate({ view: "projects", projectId: project.id })}
              >
                <ProjectLogo logo={project.logo} size={20} />
                <span className="truncate">{project.name}</span>
              </button>
            ))}
        </div>
      </nav>
      <div className="sidebar__foot">
        <button
          type="button"
          className={isAssets && active.trash ? "active" : ""}
          onClick={() => onNavigate({ view: "assets", trash: true })}
        >
          <Trash2 size={17} />
          <span>{t("回收站")}</span>
          <em>{assets.filter((item) => item.deletedAt).length || ""}</em>
        </button>
      </div>
    </aside>
  );
}
