import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { createDbClient } from "../../../shared/db";
import { BibliothequeReaderDrizzle } from "./bibliotheque-reader-drizzle";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);

// Marqueur unique pour isoler les lignes de ce test dans la table PARTAGÉE (pas de tenant).
const TAG = "ZZBIBTEST";

describe.skipIf(!URL)("BibliothequeReaderDrizzle (table partagée, RLS OFF)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  const reader = new BibliothequeReaderDrizzle(app.db);

  const cleanup = () => admin.query("delete from bibliotheque_articles where nom like $1", [`${TAG}%`]);

  beforeAll(async () => {
    await cleanup();
    await admin.query(
      "insert into bibliotheque_articles (metier,categorie,sous_categorie,nom,description,prix_base,unite) values ($1,$2,$3,$4,$5,$6,$7)",
      ["plombier", "sanitaire", "robinetterie", `${TAG} Mitigeur lavabo`, "chrome", "45.00", "u"],
    );
    await admin.query(
      "insert into bibliotheque_articles (metier,categorie,sous_categorie,nom,description,prix_base,unite) values ($1,$2,$3,$4,$5,$6,$7)",
      ["electricien", "tableau", "disjoncteur", `${TAG} Disjoncteur 16A`, "Legrand", "12.50", "u"],
    );
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await admin.end();
  });

  it("list : lecture du catalogue partagé (rôle app_tenant, sans GUC tenant)", async () => {
    const all = (await reader.list()).filter((a) => a.nom.startsWith(TAG));
    expect(all.length).toBe(2);
    expect(all.map((a) => a.unite)).toEqual(["u", "u"]);
  });

  it("list : filtre par métier et par catégorie", async () => {
    const plomb = (await reader.list({ metier: "plombier" })).filter((a) => a.nom.startsWith(TAG));
    expect(plomb.map((a) => a.nom)).toEqual([`${TAG} Mitigeur lavabo`]);
    expect(plomb[0].categorie).toBe("sanitaire");
    expect(plomb[0].prixBase).toBe("45.00");
    const elec = (await reader.list({ categorie: "tableau" })).filter((a) => a.nom.startsWith(TAG));
    expect(elec.map((a) => a.nom)).toEqual([`${TAG} Disjoncteur 16A`]);
  });

  it("search : plein-texte nom/description (ILIKE), borné métier", async () => {
    const parNom = (await reader.search(`${TAG} Mitigeur`)).filter((a) => a.nom.startsWith(TAG));
    expect(parNom.map((a) => a.nom)).toEqual([`${TAG} Mitigeur lavabo`]);
    // description matchée (Legrand) + filtre métier electricien
    const parDesc = (await reader.search("Legrand", "electricien")).filter((a) => a.nom.startsWith(TAG));
    expect(parDesc.map((a) => a.nom)).toEqual([`${TAG} Disjoncteur 16A`]);
    // filtre métier exclut l'autre
    const aucun = (await reader.search("Legrand", "plombier")).filter((a) => a.nom.startsWith(TAG));
    expect(aucun).toEqual([]);
  });
});
