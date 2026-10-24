import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Windows distribution audit. Include the full resolved graph conservatively;
// build/dev dependencies are labelled rather than claimed to be linked code.
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cargo = JSON.parse(
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
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  ),
);
const npm = JSON.parse(
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "corepack pnpm list --prod --depth Infinity --json"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const upstream = readJson("docs/legal/upstream/index.json");
const output = "docs/legal/licenses";
fs.mkdirSync(output, { recursive: true });
const components = [];
const texts = {};
const gaps = [];
const releaseBlockers = readJson("docs/legal/upstream/release-gates.json");
const nodes = new Map(cargo.resolve.nodes.map((node) => [node.id, node]));
const runtime = new Set();
function visit(id) {
  if (runtime.has(id)) return;
  runtime.add(id);
  for (const dep of nodes.get(id)?.deps || []) {
    if (dep.dep_kinds.some((kind) => kind.kind === null)) visit(dep.pkg);
  }
}
visit(cargo.resolve.root);
function legalFiles(directory, depth = 0) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "target") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && depth < 5) result.push(...legalFiles(file, depth + 1));
    else if (
      entry.isFile() &&
      /^(licen[sc]e|copying|notice|copyright|unlicense)([._-]|$)/i.test(entry.name)
    )
      result.push(file);
  }
  return result;
}
function add(component, files) {
  component.id = `${component.ecosystem}/${component.name}@${component.version}`;
  const dir = `${output}/${component.id.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  fs.mkdirSync(dir, { recursive: true });
  component.licenseFiles = [];
  texts[component.id] = [];
  for (const [index, file] of files.entries()) {
    const data = fs.readFileSync(file.path);
    const target = `${dir}/${index}-${path.basename(file.path)}`;
    fs.writeFileSync(target, data);
    component.licenseFiles.push({ path: target, source: file.source, sha256: digest(data) });
    texts[component.id].push({
      name: file.label || path.basename(file.path),
      text: data.toString("utf8"),
    });
  }
  if (!files.length) gaps.push(`${component.id}: no license text`);
  if (!component.license) gaps.push(`${component.id}: no license expression`);
  components.push(component);
}
for (const pkg of cargo.packages.filter((pkg) => nodes.has(pkg.id) && pkg.name !== "loongdun")) {
  const directory = path.dirname(pkg.manifest_path);
  const source = `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`;
  const files = legalFiles(directory).map((file) => ({
    path: file,
    source: `${source}#${path.relative(directory, file).replaceAll("\\", "/")}`,
  }));
  files.push(
    ...(upstream.find((item) => item.name === pkg.name && item.version === pkg.version)?.files ||
      []),
  );
  const component = {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    ecosystem: "cargo",
    homepage: pkg.repository || pkg.homepage || `https://crates.io/crates/${pkg.name}`,
    scope: runtime.has(pkg.id) ? "runtime-or-generated" : "build-or-development",
    source,
  };
  if (pkg.license?.includes("MPL")) {
    const archive = path.resolve(
      directory,
      "../../../cache",
      path.basename(path.dirname(directory)),
      `${pkg.name}-${pkg.version}.crate`,
    );
    const target = `docs/legal/sources/${pkg.name}-${pkg.version}.crate`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(archive, target);
    component.sourceArchive = { path: target, sha256: digest(fs.readFileSync(target)), source };
  }
  add(component, files);
}
const seen = new Set();
function npmWalk(dependencies) {
  for (const dep of Object.values(dependencies || {})) {
    const pkg = readJson(path.join(dep.path, "package.json"));
    const key = `${pkg.name}@${pkg.version}`;
    if (!seen.has(key)) {
      seen.add(key);
      const source = dep.resolved || `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`;
      add(
        {
          name: pkg.name,
          version: pkg.version,
          ecosystem: "npm",
          license: typeof pkg.license === "string" ? pkg.license : pkg.license?.type,
          homepage:
            pkg.homepage ||
            (typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url) ||
            source,
          scope: "production-dependency",
          source,
        },
        legalFiles(dep.path).map((file) => ({
          path: file,
          source: `${source}#${path.relative(dep.path, file).replaceAll("\\", "/")}`,
        })),
      );
    }
    npmWalk(dep.dependencies);
  }
}
npmWalk(npm[0].dependencies);
for (const name of ["vite", "@vitejs/plugin-react", "@tauri-apps/cli"]) {
  const directory = fs.realpathSync(`node_modules/${name}`);
  const pkg = readJson(`${directory}/package.json`);
  add(
    {
      name,
      version: pkg.version,
      ecosystem: "npm",
      license: pkg.license,
      homepage: pkg.homepage || pkg.repository?.url,
      scope: "build-tool-generated-helpers-or-installer",
      source: `https://www.npmjs.com/package/${name}/v/${pkg.version}`,
    },
    legalFiles(directory).map((file) => ({
      path: file,
      source: `npm:${name}@${pkg.version}/${path.relative(directory, file).replaceAll("\\", "/")}`,
    })),
  );
}
for (const native of readJson("docs/legal/upstream/native.json")) {
  const { files, ...component } = native;
  add({ ecosystem: "native", ...component }, files);
}
components.sort((a, b) => a.id.localeCompare(b.id));
const inputs = Object.fromEntries(
  [
    "pnpm-lock.yaml",
    "src-tauri/Cargo.lock",
    "src-tauri/Cargo.toml",
    "package.json",
    "src-tauri/tauri.conf.json",
  ].map((file) => [file, digest(fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n"))]),
);
fs.writeFileSync(
  "src/legal/third-party-components.json",
  `${JSON.stringify({ noticeVersion: 2, target: "x86_64-pc-windows-msvc", inputs, gaps, releaseBlockers, components }, null, 2)}\n`,
);
fs.writeFileSync("src/legal/third-party-license-texts.json", `${JSON.stringify(texts)}\n`);
const lines = [
  "# Loongdun third-party notices",
  "",
  "This Windows inventory conservatively includes runtime dependencies and build-time packages that may generate shipped code. Scope labels are not a claim that every listed package is linked. Exact upstream license/NOTICE files are in docs/legal/licenses and can be read offline in the application. Original texts govern; Loongdun's no-sale terms do not restrict third-party rights.",
  "",
  "MPL package sources are supplied unchanged in docs/legal/sources. See docs/legal/release-license-review.md for native/installer evidence and any unresolved distribution requirements.",
  "",
  "| Component | Version | License | Scope | Upstream |",
  "| --- | --- | --- | --- | --- |",
  ...components.map(
    (c) => `| ${c.name} | ${c.version} | ${c.license || "UNKNOWN"} | ${c.scope} | ${c.homepage} |`,
  ),
  "",
  "## Collection gaps",
  "",
  ...(gaps.length
    ? gaps.map((gap) => `- ${gap}`)
    : [
        "No missing component license files in the collected graph. This is not a complete legal conclusion; see the release review.",
      ]),
  "",
];
fs.writeFileSync("THIRD-PARTY-NOTICES.md", lines.join("\n"));
console.log(`Collected ${components.length} components; ${gaps.length} gaps`);
if (gaps.length) console.log(gaps.join("\n"));
