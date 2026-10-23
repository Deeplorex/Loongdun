import rhizomeMark from "../../src-tauri/icons/icon.png";
import { useI18n } from "../lib/i18n";

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <img src={rhizomeMark} alt="" width="40" height="40" />
      </span>
      <span className="brand__word">
        {t("龙盾")}
        {!compact && <small>{t("个人凭证库")}</small>}
      </span>
    </div>
  );
}
