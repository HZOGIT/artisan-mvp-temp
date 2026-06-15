import type { FastifyInstance } from "fastify";
import { ROBOTO_REGULAR, ROBOTO_BOLD } from "../../shared/pdf/fonts";

// Polices Roboto (regular + bold) servies en STATIQUE (parité legacy `GET /api/fonts/:name`). PUBLIC
// (sans auth) : le client les charge pour générer certains PDF côté navigateur (jsPDF), elles ne
// peuvent pas être inlinées dans le bundle (1+ Mo de base64 chacune). Décodées une fois au boot
// (asset internalisé `src/shared/pdf/fonts.ts`). Cache long immutable. 404 si nom inconnu.
const FONTS: Readonly<Record<string, Buffer>> = {
  "roboto-regular.ttf": Buffer.from(ROBOTO_REGULAR, "base64"),
  "roboto-bold.ttf": Buffer.from(ROBOTO_BOLD, "base64"),
};

export function registerFontsRoute(app: FastifyInstance): void {
  app.get("/api/fonts/:name", async (req, reply) => {
    const name = String((req.params as { name?: string }).name || "").toLowerCase();
    const buf = FONTS[name];
    if (!buf) return reply.code(404).send({ error: "font_not_found" });
    return reply
      .header("Content-Type", "font/ttf")
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("Content-Length", String(buf.length))
      .send(buf);
  });
}
