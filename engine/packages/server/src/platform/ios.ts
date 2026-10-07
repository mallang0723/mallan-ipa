import { createHmac, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { flushDB } from "../db/connection.js";
import { isIOS, isIOSBackgrounded, setIOSForeground } from "./runtime.js";

export const iosUnsupportedFeatures = [
  "Personal Server Extensions",
  "Local model / Python / MLX sidecars",
  "Local ONNX embeddings",
  "CLI subscription providers",
  "Professor Mari workspace and shell tools",
  "Calls",
  "External haptic devices",
  "Multiplayer",
  "Engine OTA and in-process restart",
] as const;

function matchesToken(value: unknown, expected: string | undefined): boolean {
  if (typeof value !== "string" || !expected || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(value))
    return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
function hostAuthorized(request: FastifyRequest): boolean {
  return matchesToken(request.headers["x-marinara-ios-host"], process.env.MARINARA_IOS_HOST_TOKEN);
}
function webAuthorized(request: FastifyRequest): boolean {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("MarinaraIOSSession="));
  return matchesToken(cookie?.slice("MarinaraIOSSession=".length), process.env.MARINARA_IOS_WEB_TOKEN);
}

export function iosAuthHook(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!isIOS) {
    done();
    return;
  }
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip)) {
    reply.code(403).send({ error: "The iOS engine is available only on loopback." });
    return;
  }
  const path = request.url.split("?")[0];
  if (request.method === "GET" && path === "/api/ios/ready") {
    done();
    return;
  }
  if (!hostAuthorized(request) && !webAuthorized(request)) {
    reply.header("Cache-Control", "no-store").code(401).send({ error: "Open Marinara from its iOS app." });
    return;
  }
  done();
}

export function iosFeatureHook(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  if (!isIOS) {
    done();
    return;
  }
  const path = request.url.split("?")[0] ?? "";
  const excluded =
    /^\/api\/(?:sidecar|utility-sidecar|haptic|multiplayer|professor-mari\/workspace)(?:\/|$)/.test(path) ||
    /^\/api\/(?:admin\/restart|updates\/apply)(?:\/|$)/.test(path) ||
    /^\/api\/(?:conversation-calls|calls)(?:\/|$)/.test(path) ||
    /^\/api\/import\/(?:pick-folder|list-directory|st-bulk)(?:\/|$)/.test(path);
  if (excluded) {
    reply.code(501).send({
      error:
        "This feature is unavailable in Marinara iOS v1. Engine changes require a new app build; runtime changes may require fully reopening the app.",
      code: "IOS_UNSUPPORTED",
    });
    return;
  }
  if (isIOSBackgrounded() && request.method === "POST" && /^\/api\/generate\/?$/.test(path)) {
    reply
      .code(409)
      .send({ error: "Generation is paused while the iOS app is in the background.", code: "IOS_BACKGROUND" });
    return;
  }
  done();
}

export function registerIOSRoutes(app: FastifyInstance): void {
  if (!isIOS) return;
  app.get<{ Querystring: { challenge?: string } }>("/api/ios/ready", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const challenge = request.query.challenge;
    if (!challenge || !/^[a-f0-9]{64}$/.test(challenge))
      return reply.code(400).send({ error: "Invalid readiness challenge" });
    return {
      version: "2.5.0",
      proof: createHmac("sha256", process.env.MARINARA_IOS_HOST_TOKEN!).update(challenge).digest("hex"),
    };
  });
  app.get("/api/ios/capabilities", async () => ({
    platform: "ios",
    unsupported: iosUnsupportedFeatures,
    restart: "reopen-app",
    foreground: !isIOSBackgrounded(),
  }));
  app.post<{ Body: { active?: unknown } }>("/api/ios/lifecycle", async (request, reply) => {
    if (!hostAuthorized(request))
      return reply.code(403).send({ error: "Only the native host may change app lifecycle state." });
    if (typeof request.body?.active !== "boolean") return reply.code(400).send({ error: "active must be a boolean" });
    setIOSForeground(request.body.active);
    if (isIOSBackgrounded()) {
      type Run = { abortController: AbortController; agentAbortController?: AbortController };
      const runtime = app as unknown as { activeGenerations: Map<string, Run>; activeAgentRuns: Map<string, Set<Run>> };
      const runs = () => [
        ...runtime.activeGenerations.values(),
        ...[...runtime.activeAgentRuns.values()].flatMap((group) => [...group]),
      ];
      for (const generation of runs()) {
        generation.abortController.abort();
        generation.agentAbortController?.abort();
      }
      // Abort is asynchronous: let the existing generation finally/save paths run
      // before acknowledging persistence to the host's short background task.
      const deadline = Date.now() + 8_000;
      while (runs().length && Date.now() < deadline) await delay(50);
      await flushDB();
      if (runs().length)
        return reply
          .code(503)
          .send({ active: false, saved: false, error: "Generation is still stopping; latest data was flushed." });
    }
    await flushDB();
    return { active: !isIOSBackgrounded(), saved: true };
  });
}
