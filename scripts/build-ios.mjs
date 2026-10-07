// Run on Mac before Xcode (also usable on Linux to exercise the exact staged JS).
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const engine = join(root, "engine");
const resources = join(root, "ios/Resources");
const stage = join(resources, ".engine-stage");
const server = join(stage, "packages/server");
function run(args) {
  const result = spawnSync("corepack", ["pnpm", ...args], { cwd: engine, stdio: "inherit", env: { ...process.env, ONNXRUNTIME_NODE_INSTALL: "skip" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} failed (${result.status})`);
}
if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node 24 and Corepack for the iOS build.");
if (!process.argv.includes("--stage-only")) run(["build"]);
for (const path of ["packages/server/dist/ios-entry.js", "packages/shared/dist/index.js", "packages/client/dist/index.html"]) {
  if (!existsSync(join(engine, path))) throw new Error(`Missing ${path}; run the full build first.`);
}
mkdirSync(resources, { recursive: true });
rmSync(stage, { recursive: true, force: true });
mkdirSync(dirname(server), { recursive: true });
// Copy the already installed, frozen-lockfile production graph. Legacy pnpm
// deploy re-resolves ranges even with --frozen-lockfile, so it is not used here.
const excluded = /^(?:@anthropic-ai\/claude-agent-sdk(?:-|$)|@huggingface\/|onnxruntime-|sharp$|@img\/|@napi-rs\/canvas)/;
const copied = new Map();
const store = join(server, "node_modules/.packages");
function findPackage(from, name) {
  for (let path = from; ; path = dirname(path)) {
    const candidate = join(path, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(path) === path) return null;
  }
}
function copyPackage(source, destination) {
  source = realpathSync(source);
  if (copied.has(source)) return copied.get(source);
  destination ??= join(store, createHash("sha256").update(relative(engine, source)).digest("hex").slice(0, 20));
  copied.set(source, destination);
  mkdirSync(destination, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  if (manifest.name.startsWith("@marinara-engine/")) {
    cpSync(join(source, "package.json"), join(destination, "package.json"));
    cpSync(join(source, "dist"), join(destination, "dist"), { recursive: true });
  } else {
    cpSync(source, destination, { recursive: true, verbatimSymlinks: true,
      filter: (path) => path === source || !relative(source, path).split(/[\\/]/).includes("node_modules") });
  }
  const dependencies = { ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies };
  for (const name of Object.keys(dependencies).sort()) {
    if (excluded.test(name)) continue;
    const dependency = findPackage(source, name);
    if (!dependency) {
      if (manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name]) throw new Error(`Missing installed dependency ${manifest.name} -> ${name}; run the frozen install.`);
      continue;
    }
    const target = copyPackage(dependency);
    const link = join(destination, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(relative(dirname(link), target), link);
  }
  return destination;
}
copyPackage(join(engine, "packages/server"), server);
cpSync(join(engine, "packages/server/dist"), join(server, "dist"), { recursive: true });
for (const path of ["packages/client/dist", "docs", "LICENSE", "package.json", "storage-format.json"]) {
  cpSync(join(engine, path), join(stage, path), { recursive: true, verbatimSymlinks: true });
}
cpSync(join(root, "ios/NodeMobile-LICENSE"), join(stage, "NodeMobile-LICENSE"));

function cleanLinks(path) {
  for (const name of readdirSync(path)) {
    const file = join(path, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) {
      if (!existsSync(file)) { rmSync(file); continue; }
      const target = realpathSync(file);
      if (!target.startsWith(`${stage}/`)) throw new Error(`Resource symlink escapes app bundle: ${relative(stage, file)}`);
      if (readlinkSync(file).startsWith("/")) { rmSync(file); symlinkSync(relative(dirname(file), target), file); }
    } else if (stat.isDirectory()) cleanLinks(file);
    else if (/\.(?:node|dylib|dll|so)(?:\.\d+)*$/.test(name)) {
      throw new Error(`Unported native dependency in resources: ${relative(stage, file)}`);
    }
  }
}
cleanLinks(stage);
writeFileSync(join(stage, "ios-build.json"), JSON.stringify({ version: "2.5.0", upstream: "7e28236962a000719dddc13f7fa2630f88b51816", node: "24.21.0-0", builtAt: new Date().toISOString() }, null, 2));
rmSync(join(resources, "engine"), { recursive: true, force: true });
renameSync(stage, join(resources, "engine"));
console.log(`Staged original engine and ${copied.size} production packages in ios/Resources/engine. Open ios/Marinara.xcodeproj on Mac.`);
