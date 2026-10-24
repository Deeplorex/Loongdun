import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { LegalDialog } from "./LegalDialog";

describe("legal dialog", () => {
  beforeEach(() => localStorage.setItem("loongdun-language", "en-US"));
  afterEach(() => localStorage.removeItem("loongdun-language"));

  it("loads original third-party license text locally on request", async () => {
    render(
      <I18nProvider>
        <LegalDialog initialDocument="open-source" onClose={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByText(/Copyright \(c\) Meta Platforms/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View license text react 19.2.8" }));
    expect(
      await screen.findByText(/Copyright \(c\) Meta Platforms/, {}, { timeout: 10_000 }),
    ).toHaveTextContent("Permission is hereby granted, free of charge");
  });

  it("describes business use and the no-sale restriction in both languages", () => {
    for (const language of ["en-US", "zh-CN"]) {
      localStorage.setItem("loongdun-language", language);
      const { unmount } = render(
        <I18nProvider>
          <LegalDialog initialDocument="terms" onClose={vi.fn()} />
        </I18nProvider>,
      );
      const license = screen.getByText(/Loongdun No-Sale License 1.0/);
      expect(license).toHaveTextContent(
        language === "en-US" ? "work and internal business" : "工作和内部业务",
      );
      expect(license).toHaveTextContent(
        language === "en-US"
          ? "charging for downloads requires written permission"
          : "不得销售原版或修改版",
      );
      unmount();
    }
  });

  it("shows the English document selected by the current language", () => {
    render(
      <I18nProvider>
        <LegalDialog initialDocument="privacy" onClose={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/does not collect, upload, sell/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Third-party open-source licenses" }),
    ).toBeInTheDocument();
  });
});
