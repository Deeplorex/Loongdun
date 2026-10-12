import { readFileSync } from "node:fs";

const rust = readFileSync("src-tauri/src/models.rs", "utf8");
const typescript = readFileSync("src/types.ts", "utf8");
const contracts = [
  "AssetKind",
  "AssetSummary",
  "AssetDetail",
  "AssetInput",
  "Project",
  "Service",
  "Environment",
  "Folder",
  "UsageBinding",
  "GraphData",
  "VaultStatus",
  "PasswordGeneratorOptions",
  "GeneratedPassword",
];

const missing = contracts.filter((name) => !rust.includes(name) || !typescript.includes(name));
if (missing.length > 0) {
  throw new Error(`Rust/TypeScript contract names drifted: ${missing.join(", ")}`);
}
console.log(`contract surface ok (${contracts.length} shared DTO names)`);
