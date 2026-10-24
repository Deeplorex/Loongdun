import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, resolveLanguage, translate, useI18n } from "./i18n";

function LanguageProbe() {
  const { language, setPreference, t } = useI18n();
  return (
    <>
      <span>{language}</span>
      <span>{t("全部凭证")}</span>
      <button type="button" onClick={() => setPreference("en-US")}>
        English
      </button>
    </>
  );
}

describe("interface language", () => {
  beforeEach(() => localStorage.clear());

  it("translates built-in interface copy without changing unknown user content", () => {
    expect(translate("全部凭证", "en-US")).toBe("All credentials");
    expect(translate("{count} 项", "en-US", { count: 3 })).toBe("3 items");
    expect(translate("我的自定义字段", "en-US")).toBe("我的自定义字段");
  });

  it("resolves the system preference from the operating-system language", () => {
    const language = vi.spyOn(window.navigator, "language", "get");
    language.mockReturnValue("zh-TW");
    expect(resolveLanguage("system")).toBe("zh-CN");
    language.mockReturnValue("en-GB");
    expect(resolveLanguage("system")).toBe("en-US");
    language.mockRestore();
  });

  it("applies and remembers an explicit language choice", async () => {
    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("All credentials")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en-US");
    expect(localStorage.getItem("loongdun-language")).toBe("en-US");
  });
});
