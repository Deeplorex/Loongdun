import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { checkEvidence } from "./legal-evidence.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const packageJson = JSON.parse(await read("package.json"));
const manifest = JSON.parse(await read("src/legal/third-party-components.json"));
const cargoToml = await read("src-tauri/Cargo.toml");
const notices = await read("THIRD-PARTY-NOTICES.md");

const errors = [];
if (process.argv.includes("--release")) {
  errors.push(
    ...(manifest.releaseBlockers || []).map(
      (gate) => `Release gate: ${gate.component}: ${gate.reason}`,
    ),
  );
}
errors.push(...(await checkEvidence(manifest, (file) => readFile(resolve(root, file)))));
for (const source of ["../docs/legal/licenses/", "../docs/legal/sources/"]) {
  const config = JSON.parse(await read("src-tauri/tauri.conf.json"));
  if (!config.bundle.resources[source]) errors.push(`Native bundle omits ${source}`);
}
const projectLicense = await read("LICENSE");
const tauriConfig = JSON.parse(await read("src-tauri/tauri.conf.json"));
if (!projectLicense.includes("Loongdun No-Sale License 1.0"))
  errors.push("Missing project no-sale license");
if (
  packageJson.license !== "SEE LICENSE IN LICENSE" ||
  !cargoToml.includes('license-file = "../LICENSE"')
)
  errors.push("Package license metadata does not reference LICENSE");
if (tauriConfig.bundle?.resources?.["../LICENSE"] !== "legal/LICENSE")
  errors.push("Native bundles must include the project LICENSE");
const components = manifest.components ?? [];
const ids = new Set(components.map((component) => component.id));
const cargoMetadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--offline",
      "--format-version",
      "1",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  ),
);
const resolvedIds = new Set(cargoMetadata.resolve.nodes.map((node) => node.id));
for (const pkg of cargoMetadata.packages) {
  if (
    pkg.name !== "loongdun" &&
    resolvedIds.has(pkg.id) &&
    !ids.has(`cargo/${pkg.name}@${pkg.version}`)
  )
    errors.push(`Missing resolved Cargo component: ${pkg.name}@${pkg.version}`);
}
const npmMetadata = JSON.parse(
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "corepack pnpm list --prod --depth Infinity --json"],
    { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
function checkNpm(dependencies) {
  for (const [name, dep] of Object.entries(dependencies || {})) {
    if (!ids.has(`npm/${name}@${dep.version}`))
      errors.push(`Missing resolved npm component: ${name}@${dep.version}`);
    checkNpm(dep.dependencies);
  }
}
checkNpm(npmMetadata[0].dependencies);
const bundledTexts = JSON.parse(await read("src/legal/third-party-license-texts.json"));
for (const component of components) {
  for (const [index, file] of component.licenseFiles.entries()) {
    if (bundledTexts[component.id]?.[index]?.text !== (await read(file.path)))
      errors.push(`Offline UI text differs from original: ${file.path}`);
  }
}
const byEcosystem = (ecosystem) =>
  new Set(components.filter((item) => item.ecosystem === ecosystem).map((item) => item.name));

const npmManifest = byEcosystem("npm");
for (const name of Object.keys(packageJson.dependencies ?? {})) {
  if (!npmManifest.has(name)) errors.push(`Missing npm runtime component: ${name}`);
}

let cargoSection = "";
const cargoRuntime = new Set();
for (const rawLine of cargoToml.split(/\r?\n/)) {
  const line = rawLine.trim();
  const sectionMatch = line.match(/^\[(.+)]$/);
  if (sectionMatch) {
    cargoSection = sectionMatch[1];
    continue;
  }
  const isRuntimeSection =
    cargoSection === "dependencies" || /^target\..+\.dependencies$/.test(cargoSection);
  if (!isRuntimeSection || line.startsWith("#")) continue;
  const dependencyMatch = line.match(/^([A-Za-z0-9_-]+)\s*=/);
  if (dependencyMatch) cargoRuntime.add(dependencyMatch[1]);
}

const cargoManifest = byEcosystem("cargo");
for (const name of cargoRuntime) {
  if (!cargoManifest.has(name)) errors.push(`Missing Cargo runtime component: ${name}`);
}

for (const component of components) {
  for (const property of ["name", "version", "license", "ecosystem", "homepage"]) {
    if (!component[property])
      errors.push(`Component is missing ${property}: ${component.name ?? "?"}`);
  }
  if (!notices.includes(`| ${component.name} |`)) {
    errors.push(`THIRD-PARTY-NOTICES.md is missing: ${component.name}`);
  }
}

const legalDocuments = [
  "docs/legal/privacy-policy.zh-CN.md",
  "docs/legal/privacy-policy.en-US.md",
  "docs/legal/terms-of-use.zh-CN.md",
  "docs/legal/terms-of-use.en-US.md",
];
for (const path of legalDocuments) {
  const document = await read(path);
  if (!document.startsWith("# ") || !document.includes("2026")) {
    errors.push(`Legal document is incomplete: ${path}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Legal evidence check passed (${components.length} components, including build support). See release-license-review.md for remaining release gates.`,
  );
}
