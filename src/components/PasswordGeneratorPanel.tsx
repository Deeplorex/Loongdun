import { RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/commands";
import { useI18n } from "../lib/i18n";
import type { PasswordGeneratorOptions } from "../types";

export const DEFAULT_GENERATOR_RULES: PasswordGeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
  requireEachSet: true,
};

export const GENERATOR_MIN_LENGTH = 8;
export const GENERATOR_MAX_LENGTH = 128;

function strengthWord(bits: number): string {
  if (bits < 50) return "偏弱";
  if (bits < 75) return "较强";
  if (bits < 100) return "强";
  return "极强";
}

interface PasswordGeneratorPanelProps {
  rules: PasswordGeneratorOptions;
  onApply: (value: string) => void;
  onPersistRules: (rules: PasswordGeneratorOptions) => Promise<void>;
  onClose: () => void;
}

export function PasswordGeneratorPanel({
  rules,
  onApply,
  onPersistRules,
  onClose,
}: PasswordGeneratorPanelProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [draft, setDraft] = useState(rules);
  const [preview, setPreview] = useState("");
  const [entropyBits, setEntropyBits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const noCharset = !draft.lowercase && !draft.uppercase && !draft.digits && !draft.symbols;

  const regenerate = useCallback(async (options: PasswordGeneratorOptions) => {
    const ticket = requestRef.current + 1;
    requestRef.current = ticket;
    setBusy(true);
    setError("");
    try {
      const result = await api.generatePassword(options);
      if (ticket !== requestRef.current) return;
      setPreview(result.value);
      setEntropyBits(result.entropyBits);
    } catch (reason) {
      if (ticket !== requestRef.current) return;
      setPreview("");
      setEntropyBits(null);
      setError(String(reason));
    } finally {
      if (ticket === requestRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void regenerate(rules);
  }, [regenerate, rules]);

  // Capture phase keeps Escape from bubbling to the editor's close handler.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  const updateRule = (patch: Partial<PasswordGeneratorOptions>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!next.lowercase && !next.uppercase && !next.digits && !next.symbols) {
      requestRef.current += 1;
      setPreview("");
      setEntropyBits(null);
      setBusy(false);
      setError("");
      return;
    }
    void regenerate(next);
  };

  const apply = async () => {
    if (!preview || applying) return;
    setApplying(true);
    setError("");
    try {
      await onPersistRules(draft);
      onApply(preview);
      onClose();
    } catch (reason) {
      setError(String(reason));
      setApplying(false);
    }
  };

  return (
    <section className="generator-panel" aria-labelledby={titleId}>
      <header className="generator-panel__head">
        <strong id={titleId}>{t("密码生成器")}</strong>
        <div className="generator-panel__actions">
          <button
            type="button"
            onClick={() => void regenerate(draft)}
            disabled={busy || noCharset}
            aria-label={t("换一个")}
          >
            <RefreshCw size={14} className={busy ? "spin" : undefined} />
          </button>
          <button type="button" onClick={onClose} aria-label={t("关闭密码生成器")}>
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="generator-panel__length">
        <label htmlFor={`${titleId}-length`}>
          <span>{t("长度")}</span>
          <output>{draft.length}</output>
        </label>
        <input
          id={`${titleId}-length`}
          type="range"
          min={GENERATOR_MIN_LENGTH}
          max={GENERATOR_MAX_LENGTH}
          value={draft.length}
          onChange={(event) => updateRule({ length: Number(event.target.value) })}
        />
      </div>

      <div className="generator-panel__sets">
        {(
          [
            ["lowercase", "小写字母"],
            ["uppercase", "大写字母"],
            ["digits", "数字"],
            ["symbols", "符号"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="generator-check">
            <input
              type="checkbox"
              checked={draft[key]}
              onChange={(event) =>
                updateRule({ [key]: event.target.checked } as Partial<PasswordGeneratorOptions>)
              }
            />
            <span>{t(label)}</span>
          </label>
        ))}
        <label className="generator-check">
          <input
            type="checkbox"
            checked={draft.excludeAmbiguous}
            onChange={(event) => updateRule({ excludeAmbiguous: event.target.checked })}
          />
          <span>{t("排除易混淆字符（l、1、I、0、O、o）")}</span>
        </label>
        <label className="generator-check">
          <input
            type="checkbox"
            checked={draft.requireEachSet}
            onChange={(event) => updateRule({ requireEachSet: event.target.checked })}
          />
          <span>{t("每类字符至少一个")}</span>
        </label>
      </div>

      <output className="generator-panel__preview">
        {preview || (noCharset ? t("至少选择一类字符") : t("正在生成…"))}
      </output>
      {entropyBits !== null && (
        <p className="generator-panel__entropy">
          {t("约 {bits} 位熵 · {strength}", {
            bits: Math.round(entropyBits),
            strength: t(strengthWord(entropyBits)),
          })}
        </p>
      )}

      <div className="generator-panel__footer">
        <button
          type="button"
          className="primary-button"
          onClick={() => void apply()}
          disabled={!preview || applying}
        >
          {t("生成并填入")}
        </button>
      </div>

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
