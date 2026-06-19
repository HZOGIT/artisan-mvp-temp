import { buildApp } from "./app";

/** Point d'entrée du nouveau stack Fastify. Bootable et déployable (squelette). */
async function main(): Promise<void> {
  const app = buildApp();
  const port = Number(process.env.NEW_STACK_PORT ?? process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen({ port, host });
  // eslint-disable-next-line no-console
  console.log(`[new-stack] Fastify en écoute sur http://${host}:${port}/`);
}

main().catch((err) => {
   
  console.error("[new-stack] échec du démarrage :", err);
  process.exit(1);
});
