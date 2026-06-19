import { buildApp } from "./app";

async function main(): Promise<void> {
  const app = buildApp();
  const port = Number(process.env.NEW_STACK_PORT ?? process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });

  app.log.info(
    {
      event: "server_start",
      port,
      host,
      env: process.env.NODE_ENV,
      betterstack: !!process.env.BETTERSTACK_TOKEN,
    },
    "Serveur démarré",
  );

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ event: "server_shutdown", signal }, "Arrêt du serveur");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  console.error("[new-stack] échec du démarrage :", err);
  process.exit(1);
});
