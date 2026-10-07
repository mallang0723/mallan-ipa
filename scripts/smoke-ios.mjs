// Focused integration smoke for the staged iOS JS, not an iPhone test.
// Optional MARINARA_AGENTS_FIXTURE_DIR points at the pinned official Agents
// checkout. Only its HTTPS transport is replaced; installer/hash/runtime stay real.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { promises as dns } from "node:dns";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const staged = join(root, "ios/Resources/engine");
const fixtures = process.env.MARINARA_AGENTS_FIXTURE_DIR;
const origin = "http://127.0.0.1:7860";

if (process.argv.includes("--engine-child")) {
  if (fixtures) {
    const lookup = dns.lookup.bind(dns);
    dns.lookup = async (name, options) => name === "raw.githubusercontent.com"
      ? [{ address: "185.199.108.133", family: 4 }] : lookup(name, options);
    const networkFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const prefix = "/Pasta-Devs/Marinara-Agents/main/";
      if (url.origin === "https://raw.githubusercontent.com" && url.pathname.startsWith(prefix)) {
        const path = url.pathname.slice(prefix.length);
        const allowed = ["catalog/v2/catalog.json", "catalog/v2/release-notes.json", "artifacts/character-tracker-1.1.1.zip", "artifacts/tic-tac-toe-1.0.5.zip"];
        if (!allowed.includes(path) || !existsSync(join(fixtures, path))) return new Response("Fixture unavailable", { status: 404 });
        const bytes = readFileSync(join(fixtures, path));
        return new Response(bytes, { headers: { "Content-Length": String(bytes.length) } });
      }
      return networkFetch(input, init);
    };
  }
  await import(pathToFileURL(join(staged, "packages/server/dist/ios-entry.js")));
} else {
  if (fixtures) {
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: fixtures, encoding: "utf8" }).stdout.trim();
    assert.equal(sha, "e816c5ba9bf74f68abedc24e4791471f59b8e1c0", "Use the documented official Agents revision");
  }
  const data = mkdtempSync(join(root, ".work/ios-integration-"));
  const hostToken = randomBytes(32).toString("hex");
  const encryptionKey = randomBytes(32).toString("hex");
  let webToken = "";
  let child;
  let browser;
  let logs = "";
  let trackerCharacterId = "";
  let gameChatId = "";
  let llmCalls = 0;
  const mock = createServer(async (req, res) => {
    if (req.url === "/api/extra/abort") { res.end("{}"); return; }
    if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ data: [{ id: "ios-fixture" }] })); return; }
    if (req.url !== "/v1/chat/completions") { res.writeHead(404); res.end("Fixture route unavailable"); return; }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw || "{}");
    if (req.headers.authorization !== "Bearer ios-fixture-key") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid fixture key", type: "invalid_api_key" } })); return;
    }
    llmCalls++;
    const prompt = JSON.stringify(input.messages ?? []);
    const tracker = prompt.includes("Legacy full-output instructions:");
    const content = tracker ? JSON.stringify({ presentCharacters: [{ characterId: trackerCharacterId, name: "iOS Fixture", mood: "hopeful", emoji: "🙂", appearance: "brown hair", outfit: "blue coat", thoughts: "Ready", stats: [] }] }) : "The iOS fixture replies. ";
    if (!input.stream) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "fixture", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 8 } })); return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const slow = !tracker && String(input.messages?.findLast((message) => message.role === "user")?.content ?? "").trim() === "SLOW_FIXTURE";
    for (let i = 0; i < (tracker ? 1 : slow ? 100 : 2); i++) {
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
      await delay(slow ? 80 : 5);
    }
    res.end(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  });
  await new Promise((done) => mock.listen(0, "127.0.0.1", done));
  const modelURL = `http://127.0.0.1:${mock.address().port}/v1`;
  async function response(path, method = "GET", body, overrides = {}) {
    return fetch(origin + path, { method, headers: { cookie: `MarinaraIOSSession=${webToken}`, "x-marinara-csrf": "1", ...(body instanceof FormData ? {} : { "content-type": "application/json" }), ...overrides }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  }
  async function api(path, method = "GET", body) {
    const r = await response(path, method, body); const text = await r.text();
    assert.ok(r.ok, `${method} ${path}: ${r.status} ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }
  async function boot() {
    webToken = randomBytes(32).toString("hex");
    logs = "";
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--engine-child"], {
      cwd: staged, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MARINARA_IOS: "1", NODE_ENV: "production", HOST: "127.0.0.1", PORT: "7860", DATA_DIR: data, FILE_STORAGE_DIR: join(data, "storage"), MARINARA_ENV_FILE: join(data, "runtime.env"), MARINARA_IOS_HOST_TOKEN: hostToken, MARINARA_IOS_WEB_TOKEN: webToken, ENCRYPTION_KEY: encryptionKey, LOG_LEVEL: "warn", AUTO_CREATE_DEFAULT_CONNECTION: "false", AUTO_OPEN_BROWSER: "false", AUTO_UPDATE_ENABLED: "false", UPDATES_APPLY_DISABLED: "true", ENABLE_EXTERNAL_EXTENSIONS: "true", MARINARA_LITE: "true", MARINARA_GIT_BRANCH: "main" }
    });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (bytes) => { logs = (logs + bytes).slice(-25_000); });
    const challenge = randomBytes(32).toString("hex");
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Engine exited: ${logs}`);
      try {
        const r = await fetch(`${origin}/api/ios/ready?challenge=${challenge}`);
        const body = await r.json();
        assert.equal(body.proof, createHmac("sha256", hostToken).update(challenge).digest("hex"), "Port 7860 is occupied by a different process");
        return;
      } catch (error) { if (error.code === "ERR_ASSERTION") throw error; }
      await delay(100);
    }
    throw new Error(`Engine readiness timed out: ${logs}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 8_000);
    await exited; clearTimeout(timer);
  }
  try {
    await boot();
    assert.equal((await fetch(origin + "/")).status, 401);
    assert.equal((await response("/api/characters", "POST", { data: { name: "Rejected" } }, { Origin: "https://untrusted.example" })).status, 403);
    assert.equal((await response("/api/ios/lifecycle", "POST", { active: false })).status, 403);
    assert.equal((await response("/api/admin/restart", "POST", { confirm: true })).status, 501);
    assert.equal((await response("/api/connections", "POST", { name: "Unsupported", provider: "claude_subscription" })).status, 501);
    assert.match(await (await response("/")).text(), /Marinara Engine/);
    console.log("PASS staged engine boot, readiness proof, app auth, origin checks and restart guard");

    const imported = await api("/api/import/st-character", "POST", { spec: "chara_card_v2", spec_version: "2.0", data: { name: "iOS Fixture", description: "A test character", first_mes: "Hello" } });
    assert.equal(imported.success, true);
    const characters = await api("/api/characters");
    const character = characters.find((row) => JSON.parse(row.data).name === "iOS Fixture");
    assert.ok(character); trackerCharacterId = character.id;
    const pngResponse = await response(`/api/characters/${character.id}/export-png`);
    assert.equal(pngResponse.status, 200);
    const png = await pngResponse.arrayBuffer();
    assert.equal(Buffer.from(png).subarray(1, 4).toString(), "PNG");
    const form = new FormData(); form.append("file", new Blob([png], { type: "image/png" }), "fixture.png");
    assert.equal((await api("/api/import/st-character", "POST", form)).success, true);
    const lorebook = await api("/api/lorebooks", "POST", { name: "iOS lore", description: "persisted fixture" });
    const connection = await api("/api/connections", "POST", { name: "Fixture only", provider: "openai", baseUrl: modelURL, apiKey: "ios-fixture-key", model: "ios-fixture", isDefault: true, defaultForAgents: true });
    const chat = await api("/api/chats", "POST", { name: "iOS saved chat", mode: "roleplay", characterIds: [character.id], connectionId: connection.id });
    const stream = await response("/api/generate", "POST", { chatId: chat.id, userMessage: "Hello fixture", streaming: true });
    const events = await stream.text();
    assert.match(events, /The iOS fixture replies/);
    assert.match(events, /"type":"done"/);
    assert.ok(llmCalls > 0);
    const messages = await api(`/api/chats/${chat.id}/messages`);
    assert.ok(messages.some((message) => message.role === "assistant" && message.content.includes("fixture replies")));
    console.log("PASS PNG/JSON import, PNG export, lorebook, external-provider HTTP path and saved streaming reply (mock API)");

    const slow = await response("/api/generate", "POST", { chatId: chat.id, userMessage: "SLOW_FIXTURE", streaming: true });
    const slowReader = slow.body.getReader(); await slowReader.read();
    assert.equal((await api("/api/generate/abort", "POST", { chatId: chat.id })).aborted, true);
    while (!(await slowReader.read()).done) {}
    const suspended = await response("/api/generate", "POST", { chatId: chat.id, userMessage: "SLOW_FIXTURE", streaming: true });
    const suspendedReader = suspended.body.getReader(); await suspendedReader.read();
    const background = await response("/api/ios/lifecycle", "POST", { active: false }, { "x-marinara-ios-host": hostToken });
    assert.equal(background.status, 200);
    while (!(await suspendedReader.read()).done) {}
    assert.equal((await api(`/api/generate/status/${chat.id}`)).active, false);
    assert.equal((await response("/api/generate", "POST", { chatId: chat.id })).status, 409);
    assert.equal((await response("/api/ios/lifecycle", "POST", { active: true }, { "x-marinara-ios-host": hostToken })).status, 200);
    console.log("PASS explicit stop, native-only lifecycle save and background generation rejection");
    const badConnection = await api("/api/connections", "POST", { name: "Invalid fixture credential", provider: "openai", baseUrl: modelURL, apiKey: "intentionally-invalid", model: "ios-fixture" });
    const badChat = await api("/api/chats", "POST", { name: "Invalid key fixture", mode: "roleplay", characterIds: [character.id], connectionId: badConnection.id });
    const failure = await (await response("/api/generate", "POST", { chatId: badChat.id, userMessage: "Fail this request" })).text();
    assert.match(failure, /401|[Ii]nvalid fixture key/);
    assert.equal((await api(`/api/generate/status/${badChat.id}`)).active, false);
    console.log("PASS invalid API key error leaves generation stopped (mock API)");

    if (fixtures) {
      const catalog = await api("/api/capability-packages/catalog");
      for (const id of ["character-tracker", "tic-tac-toe"]) {
        const entry = catalog.packages.find((item) => item.manifest.id === id); assert.ok(entry);
        await api(`/api/capability-packages/${id}/install`, "POST", { expectedVersion: entry.manifest.version, expectedArtifactSha256: entry.artifact.sha256 });
      }
    }
    const oldWebToken = webToken;
    await stop(); await boot();
    assert.equal((await response("/api/chats", "GET", undefined, { cookie: `MarinaraIOSSession=${oldWebToken}` })).status, 401);
    assert.ok((await api(`/api/chats/${chat.id}/messages`)).some((message) => message.content.includes("fixture replies")));
    assert.equal((await api(`/api/lorebooks/${lorebook.id}`)).name, "iOS lore");
    assert.equal(existsSync(join(data, ".encryption-key")), false);
    console.log("PASS full process restart persistence and session rotation; encryption key stays outside data files");

    if (fixtures) {
      const games = await api("/api/turn-games/catalog"); assert.ok(games.games.some((game) => game.gameType === "tic-tac-toe"));
      const gameChat = await api("/api/chats", "POST", { name: "iOS game fixture", mode: "conversation", characterIds: [character.id] });
      gameChatId = gameChat.id;
      const game = await api(`/api/turn-games/${gameChat.id}/start`, "POST", { gameType: "tic-tac-toe", config: { humanMark: "X" }, botCharacterIds: [character.id], humanFirst: true, seed: 1 });
      assert.equal(game.ok, true);
      assert.equal((await response("/api/capability-packages/tic-tac-toe/client")).status, 200);
      console.log("PASS official verified package install, server.mjs activation, game start and client delivery (pinned transport fixtures)");
      await api("/api/agents/type/character-tracker", "PATCH", { connectionId: connection.id });
      await api(`/api/chats/${chat.id}/metadata`, "PATCH", { enableAgents: true, activeAgentIds: ["character-tracker"], agentOverrides: { "character-tracker": true } });
      const tracked = await (await response("/api/generate", "POST", { chatId: chat.id, userMessage: "The fixture feels hopeful.", streaming: true })).text();
      assert.match(tracked, /"type":"done"/);
      const state = await api(`/api/chats/${chat.id}/game-state`);
      assert.match(JSON.stringify(state), /hopeful/, "Character Tracker must apply its result to persisted scene state");
      console.log("PASS official Character Tracker result applied to persisted scene state (mock API)");
    }
    await api("/api/personal-extensions/policy/external", "PATCH", { enabled: true });
    const pageCode = 'document.documentElement.dataset.iosExtension = "running"; marinara.onCleanup(() => { delete document.documentElement.dataset.iosExtension; });';
    const fullPage = await api("/api/personal-extensions", "POST", { name: "iOS full-page fixture", runtime: "client", capabilities: ["full_page_access"], js: pageCode });
    assert.equal((await response(`/api/personal-extensions/${fullPage.id}/approve`, "POST", { contentHash: fullPage.contentHash, acknowledgeSandboxedCode: true })).status, 400);
    await api(`/api/personal-extensions/${fullPage.id}/approve`, "POST", { contentHash: fullPage.contentHash, acknowledgeSandboxedCode: true, acknowledgeFullPageAccess: true });
    const sandbox = await api("/api/personal-extensions", "POST", { name: "iOS browser fixture", runtime: "client", capabilities: [], js: 'marinara.storage.patch({ran: true}); marinara.ui.showWindow({title: "iOS Browser Fixture", elements: [{kind: "text", text: "Browser extension running"}]});' });
    await api(`/api/personal-extensions/${sandbox.id}/approve`, "POST", { contentHash: sandbox.contentHash, acknowledgeSandboxedCode: true });
    await api(`/api/personal-extensions/${fullPage.id}/storage`, "PATCH", { apiKey: "private-extension-fixture" });
    const profile = await (await response("/api/backup/export-profile")).text();
    assert.ok(!profile.includes("private-extension-fixture"));
    assert.ok(!profile.includes("ios-fixture-key"));
    const require = createRequire(join(root, "engine/package.json"));
    const { chromium } = require("@playwright/test");
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 MarinaraIOS/1" });
    await context.addCookies([{ name: "MarinaraIOSSession", value: webToken, url: origin, httpOnly: true, sameSite: "Strict" }]);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.iosExtension === "running");
    assert.equal((await page.evaluate(() => navigator.serviceWorker.getRegistrations())).length, 0);
    for (let i = 0; i < 100; i++) { if ((await api(`/api/personal-extensions/${sandbox.id}/storage`)).value.ran) break; await delay(100); }
    assert.equal((await api(`/api/personal-extensions/${sandbox.id}/storage`)).value.ran, true);
    if (gameChatId) {
      await page.evaluate(async (chatId) => {
        await import("/api/capability-packages/tic-tac-toe/client");
        const game = document.createElement("marinara-capability-tic-tac-toe");
        game.capabilityProps = { chatId }; document.body.append(game);
      }, gameChatId);
      await page.waitForFunction(() => (document.querySelector("marinara-capability-tic-tac-toe")?.textContent?.length ?? 0) > 10);
      console.log("PASS official Tic-Tac-Toe client renders its live server state (Chromium)");
    }
    await api(`/api/personal-extensions/${fullPage.id}`, "PATCH", { enabled: false });
    await page.reload();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.iosExtension), undefined);
    const changed = await api(`/api/personal-extensions/${fullPage.id}`, "PATCH", { js: pageCode + '\n// changed' });
    assert.equal(changed.enabled, false); assert.notEqual(changed.contentHash, fullPage.contentHash);
    assert.equal((await response(`/api/personal-extensions/${fullPage.id}/approve`, "POST", { contentHash: fullPage.contentHash, acknowledgeSandboxedCode: true, acknowledgeFullPageAccess: true })).status, 409);
    await api(`/api/personal-extensions/${fullPage.id}/approve`, "POST", { contentHash: changed.contentHash, acknowledgeSandboxedCode: true, acknowledgeFullPageAccess: true });
    await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.iosExtension === "running");
    await api(`/api/personal-extensions/${sandbox.id}`, "PATCH", { enabled: false });
    assert.ok(!(await api("/api/personal-extensions/runtime/client")).some((item) => item.id === sandbox.id));
    console.log("PASS Browser/Full-page execution, disable, changed-code reapproval and profile credential exclusion (Chromium, not WKWebView)");
    const extensionRoot = process.env.MARINARA_EXTENSION_FIXTURE_ROOT;
    if (extensionRoot) {
      for (const [name, selector] of [["marinara-docs-tutor", ".mdtl-button"], ["marinara-balance-widget", ".mkbw-button"], ["marinara-worldmarble-tour", ".mwt-floating-button"]]) {
        const directory = join(extensionRoot, name, "extension");
        const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
        const extension = await api("/api/personal-extensions", "POST", { name: manifest.config.name, description: manifest.config.description, runtime: "client", capabilities: ["full_page_access"], js: readFileSync(join(directory, manifest.config.jsPath), "utf8") });
        await api(`/api/personal-extensions/${extension.id}/approve`, "POST", { contentHash: extension.contentHash, acknowledgeSandboxedCode: true, acknowledgeFullPageAccess: true });
        await page.reload(); await page.waitForSelector(selector, { state: "attached" });
        await api(`/api/personal-extensions/${extension.id}`, "PATCH", { enabled: false });
        await page.reload(); await page.waitForTimeout(500);
        assert.equal(await page.locator(selector).count(), 0);
        console.log(`PASS ${name} original script mounts and disables (no provider calls)`);
      }
    }
    console.log("iOS JS smoke passed. Xcode, WKWebView, device signing, real provider and iPhone tests remain separate.");
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    await browser?.close(); await stop(); mock.closeAllConnections(); await new Promise((done) => mock.close(done));
    rmSync(data, { recursive: true, force: true });
  }
}
