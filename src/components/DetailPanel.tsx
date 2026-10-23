import { open, save } from "@tauri-apps/plugin-dialog";
import {
  ArchiveRestore,
  Check,
  Clipboard,
  Download,
  Eye,
  FileKey2,
  GitBranch,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABELS } from "../lib/assetTemplates";
import { consumerPath, formatBytes, formatDate, formatEnvironment } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type {
  AssetDetail,
  AssetRelationInput,
  AssetRelationType,
  AssetSummary,
  Project,
  RevealResult,
  UsageBindingInput,
} from "../types";
import { PlatformLogo } from "./PlatformLogo";

const ASSET_RELATION_LABELS: Record<AssetRelationType, string> = {
  used_to_register: "用于注册",
  used_to_login: "用于登录",
  used_to_recover: "用于找回",
  issues_credential: "签发凭证",
  shared_account: "共用账号",
  other: "其他关联",
};

interface DetailPanelProps {
  detail?: AssetDetail | null;
  loadingTitle?: string;
  assets: AssetSummary[];
  projects: Project[];
  busy: boolean;
  revealSeconds: number;
  onClose: () => void;
  onShowGraph: (id: string) => void;
  onReveal: (assetId: string, fieldKey: string) => Promise<RevealResult>;
  onCopy: (assetId: string, fieldKey: string) => Promise<void>;
  onToggleFavorite: (id: string, favorite: boolean) => Promise<void>;
  onEdit: (id: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onPurge: (id: string) => Promise<void>;
  onAddAttachment: (assetId: string, path: string) => Promise<void>;
  onExportAttachment: (id: string, path: string) => Promise<void>;
  onDeleteAttachment: (id: string) => Promise<void>;
  onSaveBinding: (input: UsageBindingInput) => Promise<void>;
  onDeleteBinding: (id: string) => Promise<void>;
  onSaveAssetRelation: (input: AssetRelationInput) => Promise<void>;
  onDeleteAssetRelation: (id: string) => Promise<void>;
}

export function DetailPanel({
  detail,
  loadingTitle,
  assets,
  projects,
  busy,
  revealSeconds,
  onClose,
  onShowGraph,
  onReveal,
  onCopy,
  onToggleFavorite,
  onEdit,
  onTrash,
  onRestore,
  onPurge,
  onAddAttachment,
  onExportAttachment,
  onDeleteAttachment,
  onSaveBinding,
  onDeleteBinding,
  onSaveAssetRelation,
  onDeleteAssetRelation,
}: DetailPanelProps) {
  const { language, t } = useI18n();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string>("");
  const [bindingOpen, setBindingOpen] = useState(false);
  const [bindingTarget, setBindingTarget] = useState("");
  const [bindingPurpose, setBindingPurpose] = useState("");
  const [bindingConfig, setBindingConfig] = useState("");
  const [relationOpen, setRelationOpen] = useState(false);
  const [relationDirection, setRelationDirection] = useState<"outgoing" | "incoming">("outgoing");
  const [relationTarget, setRelationTarget] = useState("");
  const [relationType, setRelationType] = useState<AssetRelationType>("used_to_register");
  const [relationNotes, setRelationNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const revealTimers = useRef(new Map<string, number>());

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moreOpen) setMoreOpen(false);
      else if (relationOpen) setRelationOpen(false);
      else if (bindingOpen) setBindingOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [bindingOpen, moreOpen, onClose, relationOpen]);

  useEffect(() => {
    const timers = revealTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const platformChildren = useMemo(() => detail?.childAssets || [], [detail]);

  if (!detail) {
    return (
      <div className="modal-backdrop detail-modal-backdrop">
        <button
          type="button"
          className="modal-backdrop-dismiss"
          onClick={onClose}
          aria-label={t("关闭资产详情")}
          tabIndex={-1}
        />
        <section
          className="detail-panel detail-modal detail-modal--loading"
          role="dialog"
          aria-modal="true"
          aria-label={t("{title} 详情加载中", { title: loadingTitle || t("资产") })}
          aria-busy="true"
        >
          <header className="detail-head detail-head--loading">
            <span className="detail-loading__logo" />
            <div className="detail-loading__copy">
              <span />
              <strong>{loadingTitle || t("正在读取资产")}</strong>
              <span />
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t("关闭详情")}
            >
              <X size={18} />
            </button>
          </header>
          <output className="detail-loading">
            <LoaderCircle className="spin" size={22} />
            {t("正在读取凭证…")}
          </output>
        </section>
      </div>
    );
  }

  const { summary } = detail;
  const reveal = async (fieldKey: string) => {
    try {
      const result = await onReveal(summary.id, fieldKey);
      setRevealed((current) => ({ ...current, [fieldKey]: result.value }));
      const existing = revealTimers.current.get(fieldKey);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        setRevealed((current) => {
          const next = { ...current };
          delete next[fieldKey];
          return next;
        });
        revealTimers.current.delete(fieldKey);
      }, result.expiresInSeconds * 1000);
      revealTimers.current.set(fieldKey, timer);
    } catch {
      // The application-level handler presents the error without exposing secret material.
    }
  };
  const copy = async (fieldKey: string) => {
    try {
      await onCopy(summary.id, fieldKey);
      setCopied(fieldKey);
      window.setTimeout(() => setCopied((current) => (current === fieldKey ? "" : current)), 1800);
    } catch {
      // The application-level handler presents the error.
    }
  };
  const addAttachment = async () => {
    try {
      const selection = await open({ multiple: false, title: t("选择密钥或证书文件") });
      if (typeof selection === "string") await onAddAttachment(summary.id, selection);
    } catch {
      // The application-level handler presents the error.
    }
  };
  const exportAttachment = async (id: string, filename: string) => {
    try {
      const target = await save({ title: t("导出密钥文件"), defaultPath: filename });
      if (target) await onExportAttachment(id, target);
    } catch {
      // The application-level handler presents the error.
    }
  };
  const createBinding = async () => {
    if (!bindingTarget) return;
    const [consumerKind, consumerId] = bindingTarget.split(":", 2) as [
      "project" | "service" | "environment",
      string,
    ];
    const targetEnvironment = projects
      .flatMap((project) => project.environments)
      .find((environment) => environment.id === consumerId);
    try {
      await onSaveBinding({
        assetId: summary.id,
        consumerKind,
        consumerId,
        purpose: bindingPurpose,
        configKey: bindingConfig,
        environment: targetEnvironment?.kind || summary.environment,
        notes: "",
      });
      setBindingOpen(false);
      setBindingPurpose("");
      setBindingConfig("");
    } catch {
      // Keep the form open so the user can retry after the global error is shown.
    }
  };
  const createAssetRelation = async () => {
    if (!relationTarget) return;
    const sourceAssetId = relationDirection === "outgoing" ? summary.id : relationTarget;
    const targetAssetId = relationDirection === "outgoing" ? relationTarget : summary.id;
    try {
      await onSaveAssetRelation({
        sourceAssetId,
        targetAssetId,
        relationType,
        notes: relationNotes,
      });
      setRelationOpen(false);
      setRelationTarget("");
      setRelationNotes("");
    } catch {
      // Keep the form open so the user can retry after the global error is shown.
    }
  };
  const attempt = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch {
      // The application-level handler presents the error.
    }
  };
  const finishAndClose = async (operation: () => Promise<void>) => {
    try {
      await operation();
      onClose();
    } catch {
      // The application-level handler keeps the dialog open and presents the error.
    }
  };

  return (
    <div className="modal-backdrop detail-modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-dismiss"
        onClick={onClose}
        aria-label={t("关闭资产详情")}
        tabIndex={-1}
      />
      <section
        className="detail-panel detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("{title} 详情", { title: summary.title })}
      >
        <header className="detail-head">
          <PlatformLogo
            platform={summary.platform}
            title={summary.title}
            kind={summary.kind}
            coreFields={summary.coreFields}
            className={`detail-sigil detail-sigil--${summary.kind}`}
          />
          <div className="detail-head__copy">
            <div className="detail-head__line">
              <p className="eyebrow">{t(KIND_LABELS[summary.kind])}</p>
            </div>
            <h2>{summary.title}</h2>
            <p>
              {[summary.platform, summary.usernameHint].filter(Boolean).join(" · ") ||
                t("尚未填写平台信息")}
            </p>
          </div>
          <div className="detail-head__actions">
            <button
              type="button"
              className="icon-button"
              onClick={() => void attempt(() => onToggleFavorite(summary.id, !summary.favorite))}
              aria-label={t(summary.favorite ? "取消凭证星标" : "星标凭证")}
              aria-pressed={summary.favorite}
              disabled={busy}
            >
              <Star size={17} fill={summary.favorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => finishAndClose(() => onEdit(summary.id))}
              aria-label={t("编辑")}
              disabled={busy}
            >
              <Pencil size={17} />
            </button>
            <div className="detail-more">
              <button
                type="button"
                className="icon-button"
                aria-label={t("更多操作")}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((value) => !value)}
                disabled={busy}
              >
                <MoreHorizontal size={18} />
              </button>
              {moreOpen && (
                <div className="detail-more__menu">
                  <button
                    type="button"
                    onClick={() => {
                      onShowGraph(summary.id);
                      onClose();
                    }}
                  >
                    <GitBranch size={15} />
                    {t("在关系图中定位")}
                  </button>
                  {summary.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => finishAndClose(() => onRestore(summary.id))}
                    >
                      <ArchiveRestore size={15} />
                      {t("从回收站恢复")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bare-danger"
                      onClick={() => finishAndClose(() => onTrash(summary.id))}
                    >
                      <Trash2 size={15} />
                      {t("移入回收站")}
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label={t("关闭详情")}
              disabled={busy}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="detail-scroll">
          <div className="fact-strip">
            <span>
              <small>{t("环境")}</small>
              <strong>{formatEnvironment(summary.environment, language) || t("通用")}</strong>
            </span>
            <span>
              <small>{t("到期")}</small>
              <strong>{formatDate(summary.expiresAt, language)}</strong>
            </span>
            <span>
              <small>{t("使用位置")}</small>
              <strong>{detail.bindings.length}</strong>
            </span>
          </div>

          <section className="detail-section">
            <div className="section-title">
              <div>
                <h3>{t("凭证字段")}</h3>
              </div>
              <span className="secure-note">
                <ShieldCheck size={14} />
                {revealSeconds} {t("秒后隐藏")}
              </span>
            </div>
            <div className="secret-view-list">
              {detail.fields.length === 0 ? (
                <p className="section-empty">{t("尚未添加字段。")}</p>
              ) : (
                detail.fields.map((field) => (
                  <div className="secret-view" key={field.key}>
                    <div>
                      <small>{t(field.label)}</small>
                      <code className={!revealed[field.key] && field.sensitive ? "masked" : ""}>
                        {revealed[field.key] ??
                          field.value ??
                          (field.hasValue ? "••••••••••••" : "—")}
                      </code>
                    </div>
                    {field.hasValue && (
                      <div className="secret-view__actions">
                        {field.sensitive && (
                          <button
                            type="button"
                            onClick={() =>
                              revealed[field.key]
                                ? setRevealed((current) => {
                                    const timer = revealTimers.current.get(field.key);
                                    if (timer) window.clearTimeout(timer);
                                    revealTimers.current.delete(field.key);
                                    const next = { ...current };
                                    delete next[field.key];
                                    return next;
                                  })
                                : reveal(field.key)
                            }
                            aria-label={t(revealed[field.key] ? "隐藏 {label}" : "显示 {label}", {
                              label: t(field.label),
                            })}
                            disabled={busy}
                          >
                            <Eye size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => copy(field.key)}
                          aria-label={t("复制{label}", { label: t(field.label) })}
                          disabled={busy}
                        >
                          {copied === field.key ? <Check size={16} /> : <Clipboard size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="detail-section">
            <div className="section-title">
              <div>
                <h3>{t("用在哪里")}</h3>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setBindingOpen((value) => !value)}
                disabled={busy}
              >
                <Plus size={15} />
                {t("添加关联")}
              </button>
            </div>
            {bindingOpen && (
              <div className="binding-form">
                <select
                  aria-label={t("选择使用方")}
                  value={bindingTarget}
                  onChange={(event) => setBindingTarget(event.target.value)}
                  name="binding-target"
                >
                  <option value="">{t("选择产品、产品组成或环境…")}</option>
                  {projects.map((project) => (
                    <optgroup key={project.id} label={project.name}>
                      <option value={`project:${project.id}`}>
                        {project.name} ({t("产品")})
                      </option>
                      {project.services.map((service) => (
                        <option key={service.id} value={`service:${service.id}`}>
                          ↳ {service.name} ({t("产品组成")})
                        </option>
                      ))}
                      {project.environments.map((environment) => (
                        <option key={environment.id} value={`environment:${environment.id}`}>
                          ↳ {environment.name} ({formatEnvironment(environment.kind, language)})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  aria-label={t("用途")}
                  value={bindingPurpose}
                  onChange={(event) => setBindingPurpose(event.target.value)}
                  placeholder={t("用途，例如文件上传")}
                  name="binding-purpose"
                  autoComplete="off"
                />
                <input
                  aria-label={t("配置项")}
                  value={bindingConfig}
                  onChange={(event) => setBindingConfig(event.target.value)}
                  placeholder={t("配置项，例如 STORAGE_API_KEY")}
                  name="binding-config"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void createBinding()}
                  disabled={!bindingTarget || busy}
                >
                  {t("建立关联")}
                </button>
              </div>
            )}
            <div className="binding-list">
              {detail.bindings.length === 0 ? (
                <div className="section-empty-box">
                  <Link2 size={20} />
                  <span>{t("还没有使用位置")}</span>
                  <small>{t("添加关联后，这里会显示这条凭证用在了哪里。")}</small>
                </div>
              ) : (
                detail.bindings.map((binding) => (
                  <div className="binding-row" key={binding.id}>
                    <span className="binding-row__line" aria-hidden="true" />
                    <span className="binding-row__icon">
                      <GitBranch size={16} />
                    </span>
                    <span className="binding-row__copy">
                      <strong>{consumerPath(projects, binding)}</strong>
                      <small>
                        {[
                          binding.purpose,
                          binding.configKey,
                          formatEnvironment(binding.environment, language),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="bare-danger"
                      onClick={() => void attempt(() => onDeleteBinding(binding.id))}
                      aria-label={t("删除关联")}
                      disabled={busy}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="detail-section">
            <div className="section-title">
              <div>
                <h3>{t("关联凭证")}</h3>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={() => setRelationOpen((value) => !value)}
                disabled={busy}
              >
                <Plus size={15} />
                {t("添加凭证关系")}
              </button>
            </div>
            {relationOpen && (
              <div className="binding-form relation-form">
                <select
                  aria-label={t("关系方向")}
                  value={relationDirection}
                  onChange={(event) =>
                    setRelationDirection(event.target.value as "outgoing" | "incoming")
                  }
                  name="relation-direction"
                >
                  <option value="outgoing">{t("当前凭证 → 其他凭证")}</option>
                  <option value="incoming">{t("其他凭证 → 当前凭证")}</option>
                </select>
                <select
                  aria-label={t("选择另一条凭证")}
                  value={relationTarget}
                  onChange={(event) => setRelationTarget(event.target.value)}
                  name="relation-target"
                >
                  <option value="">{t("选择另一条凭证")}</option>
                  {assets
                    .filter((asset) => asset.id !== summary.id && !asset.deletedAt)
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.title} · {t(KIND_LABELS[asset.kind])}
                      </option>
                    ))}
                </select>
                <select
                  aria-label={t("关系类型")}
                  value={relationType}
                  onChange={(event) => setRelationType(event.target.value as AssetRelationType)}
                  name="relation-type"
                >
                  {Object.entries(ASSET_RELATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t("关系备注（可选）")}
                  value={relationNotes}
                  onChange={(event) => setRelationNotes(event.target.value)}
                  placeholder={t("例如：用于找回小程序账号")}
                  name="relation-notes"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void createAssetRelation()}
                  disabled={!relationTarget || busy}
                >
                  {t("建立凭证关系")}
                </button>
              </div>
            )}
            <div className="binding-list">
              {detail.assetRelations.length === 0 ? (
                <div className="section-empty-box">
                  <GitBranch size={20} />
                  <span>{t("还没有关联凭证")}</span>
                  <small>{t("关联邮箱、平台账号和它们签发的密钥。")}</small>
                </div>
              ) : (
                detail.assetRelations.map((relation) => (
                  <div className="binding-row" key={relation.id}>
                    <span className="binding-row__line" aria-hidden="true" />
                    <span className="binding-row__icon">
                      <GitBranch size={16} />
                    </span>
                    <span className="binding-row__copy">
                      <strong className="asset-relation-chain">
                        <span>{relation.sourceTitle}</span>
                        <span className="asset-relation-kind">
                          → {t(ASSET_RELATION_LABELS[relation.relationType])} →
                        </span>
                        <span>{relation.targetTitle}</span>
                      </strong>
                      {relation.notes && <small>{relation.notes}</small>}
                    </span>
                    <button
                      type="button"
                      className="bare-danger"
                      onClick={() => void attempt(() => onDeleteAssetRelation(relation.id))}
                      aria-label={t("删除凭证关系")}
                      disabled={busy}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          {(summary.kind === "secret_file" ||
            summary.kind === "server" ||
            summary.kind === "database" ||
            detail.attachments.length > 0) && (
            <section className="detail-section">
              <div className="section-title">
                <div>
                  <h3>{t("密钥文件")}</h3>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void addAttachment()}
                  disabled={busy}
                >
                  <Plus size={15} />
                  {t("添加文件")}
                </button>
              </div>
              <div className="attachment-list">
                {detail.attachments.length === 0 ? (
                  <p className="section-empty">{t("文件会加密保存，单个文件不超过 10 MB。")}</p>
                ) : (
                  detail.attachments.map((file) => (
                    <div className="attachment-row" key={file.id}>
                      <span>
                        <FileKey2 size={18} />
                      </span>
                      <div>
                        <strong>{file.filename}</strong>
                        <small>
                          {file.format.toUpperCase()} · {formatBytes(file.sizeBytes)} ·{" "}
                          {file.fingerprint.slice(0, 23)}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => void exportAttachment(file.id, file.filename)}
                        aria-label={t("导出文件")}
                        disabled={busy}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        type="button"
                        className="bare-danger"
                        onClick={() => void attempt(() => onDeleteAttachment(file.id))}
                        aria-label={t("删除文件")}
                        disabled={busy}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {platformChildren.length > 0 && (
            <section className="detail-section">
              <div className="section-title">
                <div>
                  <h3>{t("子凭证")}</h3>
                </div>
              </div>
              <div className="child-assets">
                {platformChildren.map((child: AssetSummary) => (
                  <span key={child.id}>
                    {child.title}
                    <small>{t(KIND_LABELS[child.kind])}</small>
                  </span>
                ))}
              </div>
            </section>
          )}

          {detail.notes && (
            <section className="detail-section">
              <div className="section-title">
                <div>
                  <h3>{t("备注")}</h3>
                </div>
              </div>
              <p className="notes-copy">{detail.notes}</p>
            </section>
          )}

          <section className="danger-zone">
            {summary.deletedAt ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void finishAndClose(() => onRestore(summary.id))}
                  disabled={busy}
                >
                  <ArchiveRestore size={16} />
                  {t("恢复")}
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(t("永久删除后无法恢复。确定继续？"))) {
                      void finishAndClose(() => onPurge(summary.id));
                    }
                  }}
                  disabled={busy}
                >
                  <Trash2 size={16} />
                  {t("永久删除")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="text-danger"
                onClick={() => void finishAndClose(() => onTrash(summary.id))}
                disabled={busy}
              >
                <Trash2 size={15} />
                {t("移入回收站")}
              </button>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
