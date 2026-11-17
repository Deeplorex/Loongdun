import { useId, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

export interface SuggestOption {
  key: string;
  name: string;
  hint?: string;
}

export function SuggestSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  name,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (key: string) => void;
  options: SuggestOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  "aria-label"?: string;
}) {
  const { t } = useI18n();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // query === null 表示未处于编辑态：输入框显示已选项名称，列表不过滤。
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.key === value) ?? null;
  const text = query ?? selected?.name ?? "";
  const matches = (option: SuggestOption) =>
    `${option.name} ${option.hint ?? ""}`
      .toLocaleLowerCase()
      .includes((query ?? "").trim().toLocaleLowerCase());
  const filtered = query?.trim() ? options.filter(matches) : options;
  const pick = (option: SuggestOption) => {
    onChange(option.key);
    setQuery(null);
    setOpen(false);
    inputRef.current?.focus();
  };
  const revert = () => {
    setQuery(null);
    setOpen(false);
  };
  // 失焦提交：文本恰好等于某选项名则选中它，否则还原；不重新聚焦，避免抢焦点。
  const commitTypedText = () => {
    setOpen(false);
    if (query === null) return;
    const exact = options.find((option) => option.name === text.trim());
    if (exact) onChange(exact.key);
    setQuery(null);
  };
  return (
    <div className="suggest">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        aria-label={ariaLabel}
        autoComplete="off"
        name={name}
        required={required}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          setQuery("");
          setActiveIndex(
            Math.max(
              0,
              options.findIndex((option) => option.key === value),
            ),
          );
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            setOpen(true);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const active = filtered[activeIndex];
            if (open && active) pick(active);
          } else if (event.key === "Escape") {
            revert();
          }
        }}
        onBlur={commitTypedText}
      />
      {open && (
        <div className="suggest__list" role="listbox" id={listId}>
          {filtered.length === 0 ? (
            <div className="suggest__option suggest__option--empty">{t("无匹配")}</div>
          ) : (
            filtered.map((option, index) => (
              <div
                key={option.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.key === value}
                tabIndex={-1}
                className={`suggest__option${index === activeIndex ? " suggest__option--active" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{option.name}</span>
                {option.hint && <small>{option.hint}</small>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
