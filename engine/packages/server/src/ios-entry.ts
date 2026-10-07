// Native host sets environment variables BEFORE loading any Engine module.
// Do not import index.ts: its desktop shutdown path calls process.exit().
import { isAbsolute } from "node:path";

async function startIOS() {
  if (process.env.MARINARA_IOS !== "1") throw new Error("ios-entry requires the native iOS host configuration.");
  for (const name of ["DATA_DIR", "FILE_STORAGE_DIR", "MARINARA_ENV_FILE"]) {
    if (!process.env[name] || !isAbsolute(process.env[name]!))
      throw new Error(`${name} must be an absolute app-private path.`);
  }
  for (const name of ["MARINARA_IOS_HOST_TOKEN", "MARINARA_IOS_WEB_TOKEN", "ENCRYPTION_KEY"]) {
    if (!/^[a-f0-9]{64}$/.test(process.env[name] ?? ""))
      throw new Error(`${name} must be provided by the native host.`);
  }
  if (process.env.HOST !== "127.0.0.1" || process.env.PORT !== "7860")
    throw new Error("Unexpected iOS listener configuration.");
  const { buildApp } = await import("./app.js");
  const { logger } = await import("./lib/logger.js");
  const app = await buildApp();
  try {
    await app.listen({ host: "127.0.0.1", port: 7860 });
    logger.info("Marinara iOS engine ready");
  } catch (error) {
    await app.close();
    throw error;
  }
  // Host-test shutdown and simulator termination; never try to restart Node in process.
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      void app.close();
    });
}

startIOS().catch(async (error: unknown) => {
  const { logger } = await import("./lib/logger.js");
  logger.error(error, "iOS engine startup failed; fully reopen the app after correcting the error");
  process.exitCode = 1;
});
