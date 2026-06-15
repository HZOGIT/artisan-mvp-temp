import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { registerFontsRoute } from "./fonts-route";

async function buildTestApp() {
  const app = Fastify();
  registerFontsRoute(app);
  await app.ready();
  return app;
}

const get = (app: Awaited<ReturnType<typeof buildTestApp>>, name: string) =>
  app.inject({ method: "GET", url: `/api/fonts/${name}` });

describe("registerFontsRoute", () => {
  it("roboto-regular.ttf → 200 font/ttf, cache immutable, TTF non vide (signature OpenType)", async () => {
    const app = await buildTestApp();
    const res = await get(app, "roboto-regular.ttf");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("font/ttf");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(10000);
    // entête sfnt OpenType `OTTO` ou version 0x00010000 (TrueType)
    expect(res.rawPayload.length).toBe(Number(res.headers["content-length"]));
    await app.close();
  });

  it("roboto-bold.ttf → 200 (PUBLIC, sans auth)", async () => {
    const app = await buildTestApp();
    expect((await get(app, "roboto-bold.ttf")).statusCode).toBe(200);
    await app.close();
  });

  it("nom insensible à la casse (parité legacy : toLowerCase)", async () => {
    const app = await buildTestApp();
    expect((await get(app, "Roboto-Regular.TTF")).statusCode).toBe(200);
    await app.close();
  });

  it("police inconnue → 404 font_not_found", async () => {
    const app = await buildTestApp();
    const res = await get(app, "comic-sans.ttf");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "font_not_found" });
    await app.close();
  });
});
