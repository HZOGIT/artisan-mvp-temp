import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { DevisIARepositoryDrizzle } from "./devis-ia-repository-drizzle";
import { FakeVisionPort } from "../../../shared/ports/fakes";
import { processAnalysesEnAttente } from "../../../shared/infra/analyse-photos-cron";
import type { AnalyserPhotosDeps } from "../application/use-cases";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

const UID = 9948193;
const OK_JSON = JSON.stringify({
  travaux: [
    {
      type: "Plomberie",
      description: "Fuite robinet",
      urgence: "haute",
      confiance: 85,
      articles: [{ nom: "Robinet", description: "Robinet standard", quantite: 1, unite: "u", prixEstime: 50 }],
    },
  ],
});

describe.skipIf(!URL)("processAnalysesEnAttente — L2 cron (analyse bloquée en_attente → terminee)", () => {
  const admin = new Pool({ connectionString: URL });
  const ownerHandle = createDbClient(URL!);
  const appHandle = createDbClient(APP_URL!);
  const repo = new DevisIARepositoryDrizzle(appHandle.db);

  let artisanId = 0;

  const cleanup = async () => {
    const sub = 'in (select id from artisans where "userId" = $1)';
    const an = `in (select id from analyses_photos_chantier where "artisanId" ${sub})`;
    const res = `in (select id from resultats_analyse_ia where "analyseId" ${an})`;
    await admin.query(`delete from suggestions_articles_ia where "resultatId" ${res}`, [UID]);
    await admin.query(`delete from resultats_analyse_ia where "analyseId" ${an}`, [UID]);
    await admin.query(`delete from photos_analyse where "analyseId" ${an}`, [UID]);
    await admin.query(`delete from analyses_photos_chantier where "artisanId" ${sub}`, [UID]);
    await admin.query('delete from artisans where "userId" = $1', [UID]);
  };

  beforeAll(async () => {
    await cleanup();
    artisanId = (
      await admin.query('insert into artisans ("userId","nomEntreprise") values ($1,$2) returning id', [
        UID,
        "Cron Test",
      ])
    ).rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await ownerHandle.close();
    await appHandle.close();
    await admin.end();
  });

  it("traite une analyse en_attente avec photo → statut termine", async () => {
    const ctx = { artisanId, userId: 0 };
    const analyse = await repo.createAnalyse(ctx, { titre: "Test cron bloqué" });
    await repo.addPhoto(ctx, analyse.id, { url: "data:image/jpeg;base64,AAAA", description: "photo test" });

    const deps: AnalyserPhotosDeps = {
      repo,
      vision: new FakeVisionPort(OK_JSON),
      rateLimiter: { check: async () => true },
      artisanReader: { getArtisan: async () => ({ id: artisanId, nomEntreprise: "Cron Test", email: null, specialite: null } as never) },
      bibliotheque: { list: async () => [] },
    };

    const result = await processAnalysesEnAttente(ownerHandle.db, deps);

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);

    const updated = await repo.getAnalyseOwned(ctx, analyse.id);
    expect(updated?.statut).toBe("termine");
  });

  it("ignore une analyse en_attente sans photo (pas de blocage)", async () => {
    const ctx = { artisanId, userId: 0 };
    const analyse = await repo.createAnalyse(ctx, { titre: "Test sans photo" });

    const deps: AnalyserPhotosDeps = {
      repo,
      vision: new FakeVisionPort(OK_JSON),
      rateLimiter: { check: async () => true },
      artisanReader: { getArtisan: async () => ({ id: artisanId, nomEntreprise: "Cron Test", email: null, specialite: null } as never) },
      bibliotheque: { list: async () => [] },
    };

    const result = await processAnalysesEnAttente(ownerHandle.db, deps);

    const updated = await repo.getAnalyseOwned(ctx, analyse.id);
    expect(updated?.statut).toBe("en_attente");
    expect(result.errors).toBe(0);
  });
});
