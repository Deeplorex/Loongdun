import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VaultStatus } from "../types";
import { VaultGate } from "./VaultGate";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const lockedStatus: VaultStatus = {
  state: "locked",
  vaultPath: "D:\\RhizomeVault",
  defaultVaultPath: "C:\\Users\\tester\\Documents\\RhizomeVault",
  systemUnlockAvailable: true,
  systemUnlockEnabled: true,
};

const uninitializedStatus: VaultStatus = {
  state: "uninitialized",
  defaultVaultPath: "C:\\Users\\tester\\Documents\\RhizomeVault",
  systemUnlockAvailable: false,
  systemUnlockEnabled: false,
};

const baseProps = {
  busy: false,
  error: "",
  onInitialize: vi.fn(),
  onUnlock: vi.fn(),
  onRestore: vi.fn(),
};

describe("vault gate", () => {
  it("stays silent after relocking but still allows manual Windows Hello", async () => {
    const onSystemUnlock = vi.fn().mockResolvedValue(undefined);
    render(
      <VaultGate
        {...baseProps}
        status={lockedStatus}
        automaticSystemUnlock={false}
        onSystemUnlock={onSystemUnlock}
      />,
    );
    expect(onSystemUnlock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "使用 Windows Hello" }));
    expect(onSystemUnlock).toHaveBeenCalledOnce();
  });
  it("opens Windows Hello automatically once when quick unlock is enabled", async () => {
    const onSystemUnlock = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <VaultGate {...baseProps} status={lockedStatus} onSystemUnlock={onSystemUnlock} />,
    );

    await waitFor(() => expect(onSystemUnlock).toHaveBeenCalledOnce());
    rerender(<VaultGate {...baseProps} status={lockedStatus} onSystemUnlock={onSystemUnlock} />);
    expect(onSystemUnlock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "使用 Windows Hello" })).toBeInTheDocument();
  });

  it("does not request Windows Hello when quick unlock is disabled", () => {
    const onSystemUnlock = vi.fn();
    render(
      <VaultGate
        {...baseProps}
        status={{ ...lockedStatus, systemUnlockEnabled: false }}
        onSystemUnlock={onSystemUnlock}
      />,
    );

    expect(onSystemUnlock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "使用 Windows Hello" })).not.toBeInTheDocument();
  });

  it("seeds the save location with the platform default from the backend", () => {
    render(<VaultGate {...baseProps} status={uninitializedStatus} onSystemUnlock={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: "保存位置" })).toHaveValue(
      "C:\\Users\\tester\\Documents\\RhizomeVault",
    );
  });

  it("creates the vault at a customized save location", async () => {
    render(<VaultGate {...baseProps} status={uninitializedStatus} onSystemUnlock={vi.fn()} />);

    const location = screen.getByRole("textbox", { name: "保存位置" });
    await userEvent.clear(location);
    await userEvent.type(location, "E:\\CustomVault");
    await userEvent.type(screen.getByLabelText("主密码"), "custom-location");
    await userEvent.type(screen.getByLabelText("再次输入主密码"), "custom-location");
    await userEvent.click(screen.getByRole("button", { name: "创建凭证库" }));

    await waitFor(() =>
      expect(baseProps.onInitialize).toHaveBeenCalledWith("E:\\CustomVault", "custom-location"),
    );
  });
});
