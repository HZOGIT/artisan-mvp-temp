import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { DepenseRepositoryDrizzle } from "../../infra/depense-repository-drizzle";
import { CategorieDepenseRepositoryDrizzle } from "../../../categories-depenses/infra/categorie-depense-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9890101;
const UB = 9890102;

async function token(userId: number): Promise<string> {
  return new SignJWT({ userId, email: `u${userId}@t.fr` })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
}

function callMutation(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "POST", path, input, tok);
}
function callQuery(app: ReturnType<typeof buildApp>, path: string, input: unknown, tok?: string) {
  return injectTrpc(app, "GET", path, input, tok);
}

describe.skipIf(!URL)("depenses.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let clientA = 0;
  let clientB = 0;
  let chantierB = 0;
  let server: ReturnType<typeof buildApp>;

  const purge = async (uid: number) => {
    await admin.query('delete from depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from categories_depenses where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from budgets_categories where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from regles_categorisation where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from notes_de_frais where artisan_id in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from chantiers where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from clients where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
    await admin.query('delete from artisans where "userId"=$1', [uid]);
    await admin.query("delete from users where id=$1", [uid]);
  };

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await purge(uid);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    clientA = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanA, "Client A"])).rows[0].id;
    clientB = (await admin.query('insert into clients ("artisanId",nom) values ($1,$2) returning id', [artisanB, "Client B"])).rows[0].id;
    chantierB = (
      await admin.query('insert into chantiers ("artisanId","clientId",reference,nom) values ($1,$2,$3,$4) returning id', [
        artisanB,
        clientB,
        "CH-B-DEP",
        "Chantier B",
      ])
    ).rows[0].id;
    server = buildApp({
      jwtSecret: SECRET,
      resolver: new DrizzleTenantResolver(app.db),
      depenseRepo: new DepenseRepositoryDrizzle(app.db),
      categorieDepenseRepo: new CategorieDepenseRepositoryDrizzle(app.db),
    });
  });

  afterAll(async () => {
    await server.close();
    for (const uid of [UA, UB]) await purge(uid);
    await app.close();
    await admin.end();
  });

  it("sans cookie → depenses.list 401", async () => {
    expect((await callQuery(server, "depenses.list", undefined)).statusCode).toBe(401);
  });

  it("catégories (parité client trpc.depenses.*Categorie) : 401 / scopé / create→list / isolation / update+delete", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callQuery(server, "depenses.getCategories", undefined)).statusCode).toBe(401);
    expect((await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data).toEqual([]);
    const created = await callMutation(server, "depenses.createCategorie", { nom: "Carburant", couleur: "#112233", plafondMensuel: 500 }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const listA = (await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data as Array<{ id: number; nom: string }>;
    expect(listA).toContainEqual(expect.objectContaining({ id, nom: "Carburant" }));
    expect((await callQuery(server, "depenses.getCategories", undefined, tB)).json().result.data).toEqual([]); // isolation
    expect((await callMutation(server, "depenses.updateCategorie", { id, actif: false }, tA)).json().result.data).toEqual({ success: true });
    expect((await callMutation(server, "depenses.deleteCategorie", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "depenses.getCategories", undefined, tA)).json().result.data).toEqual([]);
  });

  it("plafondMensuel : négatif → 400, zéro et positif → OK (OPE-778)", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.createCategorie", { nom: "Test", plafondMensuel: -1 }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.updateCategorie", { id: 999, plafondMensuel: -0.01 }, tA)).statusCode).toBe(400);
    const created = await callMutation(server, "depenses.createCategorie", { nom: "TestZero", plafondMensuel: 0 }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    expect((await callMutation(server, "depenses.updateCategorie", { id, plafondMensuel: 500 }, tA)).json().result.data).toEqual({ success: true });
    await callMutation(server, "depenses.deleteCategorie", { id }, tA);
  });

  it("setBudget (parité client) : upsert (categorie, mois) — create puis update, scopé tenant", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "depenses.setBudget", { categorie: "Carburant", mois: "2026-07", budget: 500 }, tA)).json().result.data).toEqual({ success: true });
    // upsert : 2e setBudget même (categorie, mois) → met à jour (pas de doublon)
    expect((await callMutation(server, "depenses.setBudget", { categorie: "Carburant", mois: "2026-07", budget: 800 }, tA)).json().result.data).toEqual({ success: true });
    const rows = await admin.query("select budget from budgets_categories where artisan_id=$1 and categorie=$2 and mois=$3", [artisanA, "Carburant", "2026-07"]);
    expect(rows.rowCount).toBe(1);
    expect(Number(rows.rows[0].budget)).toBe(800);
    expect((await callMutation(server, "depenses.setBudget", { categorie: "Carburant", mois: "2026-07", budget: 1 })).statusCode).toBe(401); // sans cookie
  });

  it("getBudgets (parité client) : réalisé calculé (SUM dépenses du mois) + écart + pct par catégorie", async () => {
    const tA = await token(UA);
    await callMutation(server, "depenses.createCategorie", { nom: "Carburant", couleur: "#112233" }, tA);
    await callMutation(server, "depenses.setBudget", { categorie: "Carburant", mois: "2026-08", budget: 500 }, tA);
    // une dépense du mois (montantTtc dérivé de montantHt+tauxTva=0 → 200.00)
    await callMutation(server, "depenses.create", { dateDepense: "2026-08-15", categorie: "Carburant", montantHt: "200.00", tauxTva: "0" }, tA);
    // + une dépense HORS mois (ne doit PAS compter dans le réalisé d'août)
    await callMutation(server, "depenses.create", { dateDepense: "2026-07-10", categorie: "Carburant", montantHt: "999.00", tauxTva: "0" }, tA);
    const data = (await callQuery(server, "depenses.getBudgets", { mois: "2026-08" }, tA)).json().result.data as Array<{
      categorie: string;
      budget: number;
      reel: number;
      ecart: number;
      pct: number;
    }>;
    const carb = data.find((b) => b.categorie === "Carburant")!;
    expect(carb).toMatchObject({ budget: 500, reel: 200, ecart: 300, pct: 40 });
    expect((await callQuery(server, "depenses.getBudgets", { mois: "2026-08" })).statusCode).toBe(401); // sans cookie
  });

  it("règles de catégorisation (parité client) : 401 / getRegles scopé / create→list / isolation / delete", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    expect((await callQuery(server, "depenses.getRegles", undefined)).statusCode).toBe(401);
    expect((await callQuery(server, "depenses.getRegles", undefined, tA)).json().result.data).toEqual([]);
    expect((await callMutation(server, "depenses.createRegle", { motifLibelle: "ESSENCE", categorie: "Carburant" }, tA)).json().result.data).toEqual({ success: true });
    const listA = (await callQuery(server, "depenses.getRegles", undefined, tA)).json().result.data as Array<{ id: number; motifLibelle: string; categorie: string }>;
    expect(listA).toContainEqual(expect.objectContaining({ motifLibelle: "ESSENCE", categorie: "Carburant" }));
    expect((await callQuery(server, "depenses.getRegles", undefined, tB)).json().result.data).toEqual([]); // isolation
    expect((await callMutation(server, "depenses.deleteRegle", { id: listA[0].id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "depenses.getRegles", undefined, tA)).json().result.data).toEqual([]);
  });

  it("listNotesFrais (parité client) : 401 / scopé tenant (A voit sa note, B ne la voit pas)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    await admin.query(
      "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin) values ($1,$2,'NF-PARITE','Frais A','2027-03-01','2027-03-31')",
      [artisanA, UA],
    );
    expect((await callQuery(server, "depenses.listNotesFrais", undefined)).statusCode).toBe(401);
    const listA = (await callQuery(server, "depenses.listNotesFrais", undefined, tA)).json().result.data as Array<{ titre: string }>;
    expect(listA).toContainEqual(expect.objectContaining({ titre: "Frais A" }));
    expect((await callQuery(server, "depenses.listNotesFrais", undefined, tB)).json().result.data).toEqual([]); // isolation
  });

  it("getNoteFraisById (parité client) : note de A → objet ; hors tenant → null (PAS 404) ; sans cookie 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin) values ($1,$2,'NF-GET','Note get','2027-04-01','2027-04-30') returning id",
        [artisanA, UA],
      )
    ).rows[0].id as number;
    expect((await callQuery(server, "depenses.getNoteFraisById", { id })).statusCode).toBe(401);
    expect((await callQuery(server, "depenses.getNoteFraisById", { id }, tA)).json().result.data).toMatchObject({ id, titre: "Note get" });
    // hors tenant → null (et statusCode 200, pas 404) — comportement legacy préservé
    const resB = await callQuery(server, "depenses.getNoteFraisById", { id }, tB);
    expect(resB.statusCode).toBe(200);
    expect(resB.json().result.data).toBeNull();
  });

  it("createNoteFrais (parité client) : numéro généré serveur (NDF-), userId forcé au créateur, 401 sans cookie", async () => {
    const tA = await token(UA);
    expect(
      (await callMutation(server, "depenses.createNoteFrais", { titre: "X", periodeDebut: "2027-05-01", periodeFin: "2027-05-31" })).statusCode,
    ).toBe(401);
    const created = await callMutation(
      server,
      "depenses.createNoteFrais",
      { titre: "Note créée", periodeDebut: "2027-05-01", periodeFin: "2027-05-31" },
      tA,
    );
    expect(created.statusCode).toBe(200);
    const note = created.json().result.data as { id: number; numero: string; userId: number; statut: string; titre: string };
    expect(note.numero).toMatch(/^NDF-\d{5}$/); // numérotation maîtrisée côté serveur (parité legacy)
    expect(note.userId).toBe(UA); // demandeur forcé au créateur (anti-IDOR)
    expect(note.statut).toBe("brouillon");
    expect(note.titre).toBe("Note créée");
    // visible dans la liste scopée tenant
    const listA = (await callQuery(server, "depenses.listNotesFrais", undefined, tA)).json().result.data as Array<{ id: number }>;
    expect(listA).toContainEqual(expect.objectContaining({ id: note.id }));
  });

  it("soumettreNoteFrais (parité client) : brouillon→soumise, idempotent, hors tenant → 404, 401 sans cookie", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const created = await callMutation(
      server,
      "depenses.createNoteFrais",
      { titre: "À soumettre", periodeDebut: "2027-06-01", periodeFin: "2027-06-30" },
      tA,
    );
    const id = (created.json().result.data as { id: number }).id;
    // 401 sans cookie
    expect((await callMutation(server, "depenses.soumettreNoteFrais", { id })).statusCode).toBe(401);
    // brouillon → soumise (+ dateSoumission)
    const sub = await callMutation(server, "depenses.soumettreNoteFrais", { id }, tA);
    expect(sub.statusCode).toBe(200);
    const note = sub.json().result.data as { statut: string; dateSoumission: string | null };
    expect(note.statut).toBe("soumise");
    expect(note.dateSoumission).not.toBeNull();
    // idempotent : re-soumettre laisse soumise (200)
    const again = await callMutation(server, "depenses.soumettreNoteFrais", { id }, tA);
    expect(again.statusCode).toBe(200);
    expect((again.json().result.data as { statut: string }).statut).toBe("soumise");
    // hors tenant → 404 (NotFound, ne révèle pas l'existence cross-tenant)
    expect((await callMutation(server, "depenses.soumettreNoteFrais", { id }, tB)).statusCode).toBe(404);
  });

  it("approuver/rejeterNoteFrais (parité client) : ⚠️ ANTI self-approbation (403), soumise→approuvee/rejetee, 409, 404, 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const AUTRE_USER = 9890199; // demandeur ≠ approbateur (UA), même artisan A
    // note SOUMISE créée par un AUTRE user de l'artisan A → UA peut l'approuver (pas self)
    const idAutre = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin, statut) values ($1,$2,'NF-AP1','Frais autre','2027-07-01','2027-07-31','soumise') returning id",
        [artisanA, AUTRE_USER],
      )
    ).rows[0].id as number;
    // 401 sans cookie
    expect((await callMutation(server, "depenses.approuverNoteFrais", { id: idAutre })).statusCode).toBe(401);
    // approuver par UA (≠ demandeur) → approuvee
    const appr = await callMutation(server, "depenses.approuverNoteFrais", { id: idAutre, commentaire: "OK" }, tA);
    expect(appr.statusCode).toBe(200);
    expect(appr.json().result.data.statut).toBe("approuvee");
    expect(appr.json().result.data.commentaireApprobateur).toBe("OK");

    // ⚠️ ANTI self-approbation : note SOUMISE dont le demandeur EST UA → UA ne peut pas l'approuver (403)
    const idSelf = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin, statut) values ($1,$2,'NF-SELF','Ma note','2027-07-01','2027-07-31','soumise') returning id",
        [artisanA, UA],
      )
    ).rows[0].id as number;
    expect((await callMutation(server, "depenses.approuverNoteFrais", { id: idSelf }, tA)).statusCode).toBe(403);
    expect((await callMutation(server, "depenses.rejeterNoteFrais", { id: idSelf, commentaire: "non" }, tA)).statusCode).toBe(403);

    // rejeter (par un autre demandeur) → rejetee + commentaire ; rejeter sans commentaire → 400
    const idRej = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin, statut) values ($1,$2,'NF-REJ','A rejeter','2027-08-01','2027-08-31','soumise') returning id",
        [artisanA, AUTRE_USER],
      )
    ).rows[0].id as number;
    expect((await callMutation(server, "depenses.rejeterNoteFrais", { id: idRej }, tA)).statusCode).toBe(400); // commentaire requis
    const rej = await callMutation(server, "depenses.rejeterNoteFrais", { id: idRej, commentaire: "Justificatif manquant" }, tA);
    expect(rej.statusCode).toBe(200);
    expect(rej.json().result.data.statut).toBe("rejetee");

    // approuver une note NON soumise (brouillon) → 409 ; hors tenant → 404
    const idBrouillon = (await callMutation(server, "depenses.createNoteFrais", { titre: "Brou", periodeDebut: "2027-09-01", periodeFin: "2027-09-30" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "depenses.approuverNoteFrais", { id: idBrouillon }, tA)).statusCode).toBe(409);
    expect((await callMutation(server, "depenses.approuverNoteFrais", { id: idAutre }, tB)).statusCode).toBe(404);
  });

  it("payerNoteFrais (parité client) : approuvee→payee + datePaiement ; 409 si non approuvée ; idempotent ; 404 ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const AUTRE = 9890198;
    // note APPROUVÉE (seedée approuvee côté admin) → payable
    const idAppr = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin, statut) values ($1,$2,'NF-PAY','A payer','2027-10-01','2027-10-31','approuvee') returning id",
        [artisanA, AUTRE],
      )
    ).rows[0].id as number;
    // 401 sans cookie
    expect((await callMutation(server, "depenses.payerNoteFrais", { id: idAppr })).statusCode).toBe(401);
    // payer → payee + datePaiement
    const pay = await callMutation(server, "depenses.payerNoteFrais", { id: idAppr }, tA);
    expect(pay.statusCode).toBe(200);
    expect(pay.json().result.data.statut).toBe("payee");
    expect(pay.json().result.data.datePaiement).not.toBeNull();
    // idempotent : re-payer reste payee (200)
    expect((await callMutation(server, "depenses.payerNoteFrais", { id: idAppr }, tA)).json().result.data.statut).toBe("payee");
    // payer une note NON approuvée (soumise) → 409
    const idSoumise = (
      await admin.query(
        "insert into notes_de_frais (artisan_id, user_id, numero, titre, periode_debut, periode_fin, statut) values ($1,$2,'NF-PAY2','Soumise','2027-10-01','2027-10-31','soumise') returning id",
        [artisanA, AUTRE],
      )
    ).rows[0].id as number;
    expect((await callMutation(server, "depenses.payerNoteFrais", { id: idSoumise }, tA)).statusCode).toBe(409);
    // hors tenant → 404
    expect((await callMutation(server, "depenses.payerNoteFrais", { id: idAppr }, tB)).statusCode).toBe(404);
  });

  it("create dérive TVA/TTC côté serveur + list scopé tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "fournitures", montantHt: "100.00", tauxTva: "20" },
      tA,
    );
    expect(created.statusCode).toBe(200);
    const data = created.json().result.data as { id: number; numero: string; montantTva: string; montantTtc: string; statut: string; userId: number };
    expect(data.montantTva).toBe("20.00");
    expect(data.montantTtc).toBe("120.00");
    expect(data.statut).toBe("brouillon");
    expect(data.numero).toMatch(/^DEP-\d{5}$/); // numéro généré côté serveur
    expect(data.userId).toBe(UA); // userId forcé au créateur
    const list = await callQuery(server, "depenses.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((d) => d.id === data.id)).toBe(true);
  });

  it("create applique le taux par défaut 20% si tauxTva absent", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "divers", montantHt: "50.00" },
      tA,
    );
    const data = created.json().result.data as { montantTva: string; montantTtc: string };
    expect(data.montantTva).toBe("10.00");
    expect(data.montantTtc).toBe("60.00");
  });

  it("numéro auto-généré, scopé tenant et incrémenté (parité legacy getNextDepenseNumero)", async () => {
    const tB = await token(UB);
    // Tenant B vierge → première dépense = DEP-00001, suivante = DEP-00002.
    const d1 = await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "x", montantHt: "1.00" }, tB);
    const d2 = await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "x", montantHt: "1.00" }, tB);
    const n1 = d1.json().result.data.numero as string;
    const n2 = d2.json().result.data.numero as string;
    expect(n1).toBe("DEP-00001");
    expect(n2).toBe("DEP-00002");
  });

  it("validation : montant non décimal → 400 ; taux > 100 → 400", async () => {
    const tA = await token(UA);
    const b = { dateDepense: "2026-06-15", categorie: "x" };
    expect((await callMutation(server, "depenses.create", { ...b, montantHt: "abc" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "depenses.create", { ...b, montantHt: "10", tauxTva: "150" }, tA)).statusCode).toBe(400);
  });

  it("ANTI-IDOR-FK : create avec un clientId/chantierId d'un autre tenant → 404", async () => {
    const tA = await token(UA);
    const base = { dateDepense: "2026-06-15", categorie: "achat", montantHt: "10.00" };
    expect((await callMutation(server, "depenses.create", { ...base, clientId: clientB }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.create", { ...base, chantierId: chantierB }, tA)).statusCode).toBe(404);
  });

  it("ANTI-IDOR-FK : create avec un clientId du tenant → OK", async () => {
    const tA = await token(UA);
    const created = await callMutation(
      server,
      "depenses.create",
      { dateDepense: "2026-06-15", categorie: "achat", montantHt: "10.00", clientId: clientA },
      tA,
    );
    expect(created.statusCode).toBe(200);
    expect((created.json().result.data as { clientId: number }).clientId).toBe(clientA);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas la dépense de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (
      await callMutation(server, "depenses.create", { dateDepense: "2026-06-15", categorie: "secret", montantHt: "99.00" }, tA)
    ).json().result.data.id as number;
    expect((await callQuery(server, "depenses.getById", { id }, tB)).statusCode).toBe(404);
    const listB = (await callQuery(server, "depenses.list", undefined, tB)).json().result.data as Array<{ id: number }>;
    expect(listB.some((d) => d.id === id)).toBe(false); // B ne voit jamais la dépense de A
    expect((await callMutation(server, "depenses.update", { id, description: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.delete", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "depenses.getById", { id }, tA)).json().result.data.categorie).toBe("secret");
  });

  it("update recalcule la TVA quand montantHt change ; champ non concerné préservé", async () => {
    const tA = await token(UA);
    const id = (
      await callMutation(
        server,
        "depenses.create",
        { dateDepense: "2026-06-15", categorie: "outil", montantHt: "100.00", tauxTva: "20", fournisseur: "ACME" },
        tA,
      )
    ).json().result.data.id as number;
    const maj = await callMutation(server, "depenses.update", { id, montantHt: "200.00" }, tA);
    const data = maj.json().result.data as { montantHt: string; montantTva: string; montantTtc: string; fournisseur: string };
    expect(data.montantTva).toBe("40.00");
    expect(data.montantTtc).toBe("240.00");
    expect(data.fournisseur).toBe("ACME"); // préservé
    expect((await callMutation(server, "depenses.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "depenses.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("id inexistant du même tenant : getById / update / delete → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "depenses.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.update", { id: 999999999, description: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "depenses.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });
});
