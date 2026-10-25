import { Clock3, Copy, KeyRound, Plus, Search, SlidersHorizontal, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABELS } from "../lib/assetTemplates";
import { daysUntil, expiryState, todayIso } from "../lib/expiry";
import { formatDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { AssetSummary } from "../types";
import { PlatformLogo } from "./PlatformLogo";

interface AssetListProps {
  title: string;
  assets: AssetSummary[];
  selectedId?: string;
  query: string;
  searchInputId: string;
  expiryReminderDays: number;
  emptyTitle?: string;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCopy: (assetId: string, fieldKey: string) => void | Promise<void>;
}

export function AssetList({
  title,
  assets,
  selectedId,
  query,
  searchInputId,
  expiryReminderDays,
  emptyTitle,
  onQueryChange,
  onSelect,
  onCreate,
  onCopy,
}: AssetListProps) {
  const { language, t } = useI18n();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"updated" | "title" | "expiry">("updated");
  const [expiryOnly, setExpiryOnly] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const today = todayIso();

  const expiryLabel = (asset: AssetSummary) => {
    if (!asset.expiresAt) return { className: "", text: t("长期有效") };
    const state = expiryState(asset.expiresAt, today, expiryReminderDays);
    if (!state) return { className: "", text: formatDate(asset.expiresAt, language) };
    const days = daysUntil(asset.expiresAt, today);
    if (state === "expired") {
      return {
        className: "asset-card__expiry--expired",
        text: t("已过期 {days} 天", { days: -days }),
      };
    }
    if (days === 0) return { className: "asset-card__expiry--expiring", text: t("今天到期") };
    return {
      className: "asset-card__expiry--expiring",
      text: t("{days} 天后到期", { days }),
    };
  };

  useEffect(() => {
    if (!filtersOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setFiltersOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

  const displayedAssets = useMemo(() => {
    const filtered = expiryOnly ? assets.filter((asset) => asset.expiresAt) : [...assets];
    return filtered.sort((left, right) => {
      if (sortBy === "title") return left.title.localeCompare(right.title, language);
      if (sortBy === "expiry") {
        return (left.expiresAt || "9999").localeCompare(right.expiresAt || "9999");
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [assets, expiryOnly, language, sortBy]);

  return (
    <section className="asset-column" aria-label={t("资产列表")}>
      <header className="asset-column__head">
        <div>
          <h1>{title}</h1>
        </div>
        <button
          type="button"
          className="primary-icon"
          onClick={onCreate}
          aria-label={t("新建凭证")}
        >
          <Plus size={20} />
        </button>
      </header>
      <div className="asset-list-tools" ref={toolsRef}>
        <div className="search-box">
          <Search size={17} />
          <input
            id={searchInputId}
            name="asset-search"
            aria-label={t("搜索凭证")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("名称、平台、IP、用户名…")}
          />
          <kbd>Ctrl K</kbd>
          <button
            type="button"
            className={`search-box__tail ${filtersOpen || expiryOnly || sortBy !== "updated" ? "active" : ""}`}
            aria-label={t("筛选与排序")}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
        {filtersOpen && (
          <fieldset className="asset-filters">
            <legend className="sr-only">{t("筛选与排序选项")}</legend>
            <label>
              <span>{t("排序")}</span>
              <select
                name="asset-sort"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as "updated" | "title" | "expiry")
                }
              >
                <option value="updated">{t("最近更新")}</option>
                <option value="title">{t("名称")}</option>
                <option value="expiry">{t("到期时间")}</option>
              </select>
            </label>
            <label className="asset-filters__check">
              <input
                name="asset-expiry-filter"
                type="checkbox"
                checked={expiryOnly}
                onChange={(event) => setExpiryOnly(event.target.checked)}
              />
              {t("只看设置了到期时间的资产")}
            </label>
            {(expiryOnly || sortBy !== "updated") && (
              <button
                type="button"
                className="text-button asset-filters__reset"
                onClick={() => {
                  setSortBy("updated");
                  setExpiryOnly(false);
                }}
              >
                {t("重置")}
              </button>
            )}
          </fieldset>
        )}
      </div>
      <div className="result-meta" aria-live="polite">
        <span>{t("{count} 项", { count: displayedAssets.length })}</span>
        <span>{expiryOnly ? t("仅显示有到期时间的资产") : t("单击一行查看详情")}</span>
      </div>
      <div className="asset-list" role="listbox" aria-label={title}>
        {displayedAssets.length > 0 && (
          <div className="asset-list__header" aria-hidden="true">
            <span>{t("资产")}</span>
            <span>{t("类型")}</span>
            <span>{t("平台 / 账号")}</span>
            <span>{t("核心字段")}</span>
            <span>{t("环境 / 标签")}</span>
            <span>{t("时间")}</span>
          </div>
        )}
        {displayedAssets.length === 0 ? (
          <div className="empty-list">
            <span>
              <KeyRound size={23} />
            </span>
            <h3>{query ? t("没有匹配项") : (emptyTitle ?? t("这里还没有凭证"))}</h3>
            <p>{query ? t("试试名称、平台或标签。") : t("添加第一条凭证，也可以稍后关联产品。")}</p>
            {!query && (
              <button type="button" className="secondary-button" onClick={onCreate}>
                <Plus size={16} />
                {t("新建凭证")}
              </button>
            )}
          </div>
        ) : (
          displayedAssets.map((asset, index) => (
            <div
              role="option"
              tabIndex={0}
              aria-selected={selectedId === asset.id}
              key={asset.id}
              className={`asset-card ${selectedId === asset.id ? "asset-card--active" : ""}`}
              onClick={() => onSelect(asset.id)}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(asset.id);
                }
              }}
              style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}
            >
              <span className="asset-card__asset">
                <PlatformLogo
                  platform={asset.platform}
                  title={asset.title}
                  kind={asset.kind}
                  coreFields={asset.coreFields}
                  className={`asset-card__sigil asset-card__sigil--${asset.kind}`}
                />
                <span className="asset-card__body">
                  <span className="asset-card__title">
                    {asset.title}
                    {asset.favorite && <Star size={13} fill="currentColor" />}
                  </span>
                  <small>
                    {asset.deletedAt
                      ? t("已移入回收站")
                      : asset.platform || t(KIND_LABELS[asset.kind])}
                  </small>
                </span>
              </span>
              <span className="asset-card__type">{t(KIND_LABELS[asset.kind])}</span>
              <span className="asset-card__identity">
                <strong title={asset.platform || undefined}>{asset.platform || "—"}</strong>
                <small title={asset.usernameHint || undefined}>
                  {asset.usernameHint || t("未填写")}
                </small>
              </span>
              <span className="asset-card__fields">
                {(asset.coreFields || []).length === 0 ? (
                  <small>{t("尚未填写")}</small>
                ) : (
                  asset.coreFields.map((field) => (
                    <span key={field.key} className="asset-card__field">
                      <small>{t(field.label)}</small>
                      <span className="asset-card__field-value">
                        <strong title={field.sensitive ? t("已脱敏") : field.value}>
                          {field.value}
                        </strong>
                        <button
                          type="button"
                          aria-label={t("复制{label}", { label: t(field.label) })}
                          title={t("复制{label}", { label: t(field.label) })}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onCopy(asset.id, field.key);
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </span>
                    </span>
                  ))
                )}
              </span>
              <span className="asset-card__classification">
                <span className="asset-card__tags">
                  {asset.environment && <i>{asset.environment}</i>}
                  {asset.tags.map((tag) => (
                    <i key={tag}>{tag}</i>
                  ))}
                  {!asset.environment && asset.tags.length === 0 && <small>—</small>}
                </span>
              </span>
              <span className="asset-card__meta">
                {(() => {
                  const expiry = expiryLabel(asset);
                  return (
                    <small
                      className={`asset-card__expiry ${expiry.className}`}
                      title={asset.expiresAt ? formatDate(asset.expiresAt, language) : undefined}
                    >
                      <Clock3 size={13} />
                      {expiry.text}
                    </small>
                  );
                })()}
                <small>{t("更新 {date}", { date: formatDate(asset.updatedAt, language) })}</small>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
