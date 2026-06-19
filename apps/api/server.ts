import v8 from "node:v8";
import { buildApp } from "./app";
import { getDbHandle } from "./shared/db/client";
import { provisionDatabase, assertAppRoleExistsAndRestricted } from "./shared/db/provision-database";

async function main(): Promise<void> {
  /* Provision automatique au boot (sous verrou) : migrations schéma + RLS, rôle applicatif + droits. */
  await provisionDatabase();
  /* Fail-closed : refuse de servir si le pool runtime peut contourner la RLS. */
  await assertAppRoleExistsAndRestricted(getDbHandle().db);

  const app = buildApp();
  const port = Number(process.env.NEW_STACK_PORT ?? process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });

  const startMem = process.memoryUsage();
  app.log.info(
    {
      event: "server_start",
      port,
      host,
      env: process.env.NODE_ENV,
      betterstack: !!process.env.BETTERSTACK_TOKEN,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      resend: !!process.env.RESEND_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      jwtConfigured: !!process.env.JWT_SECRET,
      heapUsedMb: Math.round(startMem.heapUsed / 1024 / 1024),
      rssMb: Math.round(startMem.rss / 1024 / 1024),
    },
    "Serveur démarré",
  );

  /** Check mémoire toutes les 5 min — warn si heap > 80% de la limite JVM. */
  const memInterval = setInterval(() => {
    const stats = v8.getHeapStatistics();
    const heapUsedMb = Math.round(stats.used_heap_size / 1024 / 1024);
    const heapLimitMb = Math.round(stats.heap_size_limit / 1024 / 1024);
    const heapPercent = Math.round((stats.used_heap_size / stats.heap_size_limit) * 100);
    if (heapPercent >= 80) {
      app.log.warn(
        { event: "memory_high", heapUsedMb, heapLimitMb, heapPercent },
        `Heap élevé : ${heapUsedMb}MB / ${heapLimitMb}MB (${heapPercent}%)`,
      );
    }
  }, 5 * 60 * 1000).unref();

  const shutdown = async (signal: string): Promise<void> => {
    clearInterval(memInterval);
    app.log.info({ event: "server_shutdown", signal }, "Arrêt du serveur");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    app.log.fatal({ event: "unhandled_rejection", err }, "Promesse rejetée non gérée — arrêt imminent");
    process.exit(1);
  });

  process.on("uncaughtException", (error: Error) => {
    app.log.fatal(
      { event: "uncaught_exception", err: error },
      "Exception non capturée — arrêt imminent",
    );
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  console.error("[new-stack] échec du démarrage :", err);
  process.exit(1);
});
