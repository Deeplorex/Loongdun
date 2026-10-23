import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Brand } from "./Brand";
import { I18nProvider } from "../lib/i18n";

function renderBrand() {
  render(
    <I18nProvider>
      <Brand />
    </I18nProvider>,
  );
}

describe("brand wordmark", () => {
  it("shows 龙盾 in Chinese", () => {
    localStorage.setItem("rhizome-language", "zh-CN");
    renderBrand();
    expect(screen.getByText("龙盾")).toBeInTheDocument();
  });

  it("shows Rhizome in English", () => {
    localStorage.setItem("rhizome-language", "en-US");
    renderBrand();
    expect(screen.getByText("Rhizome")).toBeInTheDocument();
  });
});
