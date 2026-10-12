import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/commands";
import type { PasswordGeneratorOptions } from "../types";
import { DEFAULT_GENERATOR_RULES, PasswordGeneratorPanel } from "./PasswordGeneratorPanel";

vi.mock("../lib/commands", () => ({ api: { generatePassword: vi.fn() } }));

const mocked = vi.mocked(api.generatePassword);

beforeEach(() => {
  mocked.mockReset();
});

const rules = (overrides: Partial<PasswordGeneratorOptions> = {}): PasswordGeneratorOptions => ({
  ...DEFAULT_GENERATOR_RULES,
  ...overrides,
});

const result = (value: string, entropyBits = 130) => ({ value, entropyBits });

function renderPanel(overrides: Partial<Parameters<typeof PasswordGeneratorPanel>[0]> = {}) {
  const onApply = vi.fn();
  const onPersistRules = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <PasswordGeneratorPanel
      rules={rules()}
      onApply={onApply}
      onPersistRules={onPersistRules}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onApply, onPersistRules, onClose };
}

describe("PasswordGeneratorPanel", () => {
  it("generates a preview from the current rules on open", async () => {
    mocked.mockResolvedValueOnce(result("generated-preview-value"));
    renderPanel();

    expect(mocked).toHaveBeenCalledWith(rules());
    expect(await screen.findByText("generated-preview-value")).toBeVisible();
    expect(screen.getByText(/130 位熵/)).toBeVisible();
    expect(screen.getByText(/极强/)).toBeVisible();
  });

  it("regenerates with updated options whenever a rule changes", async () => {
    mocked.mockResolvedValue(result("rule-following-value"));
    renderPanel();
    await screen.findByText("rule-following-value");

    await userEvent.click(screen.getByRole("checkbox", { name: "大写字母" }));
    await waitFor(() => expect(mocked).toHaveBeenLastCalledWith(rules({ uppercase: false })));
    await userEvent.click(screen.getByRole("checkbox", { name: "符号" }));
    await waitFor(() =>
      expect(mocked).toHaveBeenLastCalledWith(rules({ uppercase: false, symbols: false })),
    );
  });

  it("fills the field and persists the rules on apply", async () => {
    mocked.mockResolvedValue(result("applied-password"));
    const { onApply, onPersistRules, onClose } = renderPanel();
    await screen.findByText("applied-password");

    await userEvent.click(screen.getByRole("button", { name: "生成并填入" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith("applied-password"));
    expect(onPersistRules).toHaveBeenCalledWith(rules());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the panel open when persisting the rules fails", async () => {
    mocked.mockResolvedValue(result("unpersisted-password"));
    const { onApply, onClose } = renderPanel({
      onPersistRules: vi.fn().mockRejectedValue("设置值超出允许范围"),
    });
    await screen.findByText("unpersisted-password");

    await userEvent.click(screen.getByRole("button", { name: "生成并填入" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("设置值超出允许范围");
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks for at least one character set before applying", async () => {
    mocked.mockResolvedValue(result("any-value"));
    renderPanel();
    await screen.findByText("any-value");

    await userEvent.click(screen.getByRole("checkbox", { name: "小写字母" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "大写字母" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "数字" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "符号" }));

    expect(screen.getByText("至少选择一类字符")).toBeVisible();
    expect(screen.getByRole("button", { name: "生成并填入" })).toBeDisabled();
    // The last uncheck stops at the guard instead of calling the backend.
    expect(mocked).toHaveBeenCalledTimes(4);
  });
});
