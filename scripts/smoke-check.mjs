import { existsSync, readFileSync } from "node:fs";

const required = [
  "dist/index.html",
  "src-tauri/tauri.conf.json",
  "src-tauri/capabilities/default.json",
];
const missing = required.filter((path) => !existsSync(path));
if (missing.length > 0) {
  throw new Error(`Missing build artifacts/configuration: ${missing.join(", ")}`);
}
console.log("Loongdun build artifacts are present");

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
if (config.bundle.windows.wix?.language !== "zh-CN") {
  throw new Error("Chinese product names require the zh-CN MSI language/code page");
}
const mainWindow = config.app?.windows?.[0];
if (mainWindow?.maximized !== true) {
  throw new Error("The main window must start maximized");
}
