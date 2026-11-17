import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SuggestSelect } from "./SuggestSelect";

const options = [
  { key: "email", name: "注册邮箱", hint: "QQ 邮箱" },
  { key: "api", name: "API 密钥", hint: "OpenAI" },
];

// 受控用法：把选择回写到 value，输入框才会显示选中项名称。
function Harness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <SuggestSelect value={value} onChange={setValue} options={options} />;
}

describe("SuggestSelect", () => {
  it("filters options while typing and picks a clicked match", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.type(input, "api");
    expect(screen.getByRole("option", { name: /API 密钥/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /注册邮箱/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: /API 密钥/ }));
    expect(input).toHaveValue("API 密钥");
  });

  it("matches against the hint as well as the name", async () => {
    const onChange = vi.fn();
    render(<SuggestSelect value="" onChange={onChange} options={options} />);
    await userEvent.type(screen.getByRole("combobox"), "OpenAI");
    await userEvent.click(screen.getByRole("option", { name: /API 密钥/ }));
    expect(onChange).toHaveBeenCalledWith("api");
  });

  it("picks the highlighted option with the keyboard", async () => {
    const onChange = vi.fn();
    render(<SuggestSelect value="" onChange={onChange} options={options} />);
    const input = screen.getByRole("combobox");
    await userEvent.click(input);
    await userEvent.type(input, "密钥");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("api");
  });

  it("shows the selected name and reverts on Escape", async () => {
    const onChange = vi.fn();
    render(<SuggestSelect value="email" onChange={onChange} options={options} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveValue("注册邮箱");
    await userEvent.click(input);
    await userEvent.type(input, "随便写");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("注册邮箱");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reverts unmatched text to empty on blur so required still applies", async () => {
    const onChange = vi.fn();
    render(
      <form>
        <SuggestSelect value="" onChange={onChange} options={options} required />
      </form>,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "不存在");
    expect(screen.getByText("无匹配")).toBeInTheDocument();
    await userEvent.tab();
    expect(input).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("selects the option whose name was typed exactly on blur", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "API 密钥");
    await userEvent.tab();
    expect(input).toHaveValue("API 密钥");
  });
});
