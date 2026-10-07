import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = JSON.parse(readFileSync(join(root, "ios/runtime-lock.json"), "utf8"));
const destination = join(root, "ios/Vendor");
mkdirSync(destination, { recursive: true });
const temporary = mkdtempSync(join(destination, ".download-"));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
try {
  const archive = join(temporary, "runtime.zip");
  run("curl", ["--fail", "--location", "--retry", "2", "--proto", "=https", "--proto-redir", "=https", "--output", archive, lock.url]);
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (actual !== lock.sha256) throw new Error("Node runtime checksum mismatch; nothing was installed.");
  // Extract only the verified release artifact. Never download at app startup.
  run("unzip", ["-q", archive, "-d", temporary]);
  for (const name of [lock.framework, "include"]) {
    rmSync(join(destination, name), { recursive: true, force: true });
    renameSync(join(temporary, name), join(destination, name));
  }
  console.log(`Installed verified NodeMobile ${lock.tag}.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
