import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { buildApp } from "../../../../app";
import { createDbClient } from "../../../../shared/db";
import { DrizzleTenantResolver } from "../../../../shared/tenant/drizzle-tenant-resolver";
import { TechnicienRepositoryDrizzle } from "../../infra/technicien-repository-drizzle";
import { injectTrpc } from "../../../../shared/testing/trpc-inject";

const URL = process.env.DATABASE_URL;
const APP_URL =
  process.env.APP_DATABASE_URL ||
  (URL ? URL.replace(/:\/\/[^@]+@/, "://app_tenant:app_tenant_pw@") : undefined);
const SECRET = "test-secret-at-least-32-characters-long-xxxx";

const UA = 9935001;
const UB = 9935002;
const COLLAB_A = 9935011;
const COLLAB_B = 9935012;

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

describe.skipIf(!URL)("techniciens.router e2e (HTTP → tRPC → use-case → repo → RLS)", () => {
  const admin = new Pool({ connectionString: URL });
  const app = createDbClient(APP_URL!);
  let artisanA = 0;
  let artisanB = 0;
  let server: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    for (const uid of [UA, UB]) {
      await admin.query('delete from disponibilites_techniciens where "technicienId" in (select id from techniciens where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId" in (select id from artisans where "userId"=$1))', [uid]);
      await admin.query('delete from techniciens where "artisanId" in (select id from artisans where "userId"=$1)', [uid]);
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
      await admin.query("insert into users (id, email, password, role) values ($1,$2,'x','artisan')", [uid, `u${uid}@t.fr`]);
    }
    artisanA = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UA])).rows[0].id;
    artisanB = (await admin.query('insert into artisans ("userId") values ($1) returning id', [UB])).rows[0].id;
    // Collaborateurs liés (users.artisanId) — un par tenant.
    await admin.query("delete from users where id in ($1,$2)", [COLLAB_A, COLLAB_B]);
    await admin.query('insert into users (id, email, password, role, name, "artisanId") values ($1,$2,\'x\',\'technicien\',$3,$4)', [COLLAB_A, `c${COLLAB_A}@t.fr`, "Collab A", artisanA]);
    await admin.query('insert into users (id, email, password, role, name, "artisanId") values ($1,$2,\'x\',\'secretaire\',$3,$4)', [COLLAB_B, `c${COLLAB_B}@t.fr`, "Collab B", artisanB]);
    server = buildApp({ jwtSecret: SECRET, resolver: new DrizzleTenantResolver(app.db), technicienRepo: new TechnicienRepositoryDrizzle(app.db) });
  });

  afterAll(async () => {
    await server.close();
    for (const aId of [artisanA, artisanB]) {
      await admin.query('delete from interventions where "artisanId"=$1', [aId]);
      await admin.query('delete from clients where "artisanId"=$1', [aId]);
      await admin.query('delete from habilitations_techniciens where "artisanId"=$1', [aId]);
      await admin.query('delete from disponibilites_techniciens where "technicienId" in (select id from techniciens where "artisanId"=$1)', [aId]);
      await admin.query('delete from positions_techniciens where "technicienId" in (select id from techniciens where "artisanId"=$1)', [aId]);
      await admin.query('delete from techniciens where "artisanId"=$1', [aId]);
    }
    await admin.query("delete from users where id in ($1,$2)", [COLLAB_A, COLLAB_B]);
    for (const uid of [UA, UB]) {
      await admin.query('delete from artisans where "userId"=$1', [uid]);
      await admin.query("delete from users where id=$1", [uid]);
    }
    await app.close();
    await admin.end();
  });

  it("sans cookie → techniciens.list 401", async () => {
    expect((await callQuery(server, "techniciens.list", undefined)).statusCode).toBe(401);
  });

  it("create + list scopés au tenant A", async () => {
    const tA = await token(UA);
    const created = await callMutation(server, "techniciens.create", { nom: "Martin", specialite: "Plomberie" }, tA);
    expect(created.statusCode).toBe(200);
    const id = created.json().result.data.id as number;
    const list = await callQuery(server, "techniciens.list", undefined, tA);
    expect((list.json().result.data as Array<{ id: number }>).some((t) => t.id === id)).toBe(true);
  });

  it("validation Zod : nom vide → 400 ; email invalide → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "techniciens.create", { nom: "" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "X", email: "pas-un-email" }, tA)).statusCode).toBe(400);
  });

  it("isolation cross-tenant : B ne voit/modifie/supprime pas le technicien de A", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const id = (await callMutation(server, "techniciens.create", { nom: "Secret" }, tA)).json().result.data.id as number;
    expect((await callQuery(server, "techniciens.getById", { id }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "techniciens.list", undefined, tB)).json().result.data).toEqual([]);
    expect((await callMutation(server, "techniciens.update", { id, nom: "hack" }, tB)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.delete", { id }, tB)).statusCode).toBe(404);
    // intact pour A
    expect((await callQuery(server, "techniciens.getById", { id }, tA)).json().result.data.nom).toBe("Secret");
  });

  it("update + delete OK pour le propriétaire", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "techniciens.create", { nom: "Temp" }, tA)).json().result.data.id as number;
    expect((await callMutation(server, "techniciens.update", { id, statut: "conge" }, tA)).json().result.data.statut).toBe("conge");
    expect((await callMutation(server, "techniciens.delete", { id }, tA)).json().result.data).toEqual({ success: true });
    expect((await callQuery(server, "techniciens.getById", { id }, tA)).statusCode).toBe(404);
  });

  it("getById / update / delete sur un id inexistant du même tenant → 404", async () => {
    const tA = await token(UA);
    expect((await callQuery(server, "techniciens.getById", { id: 999999999 }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.update", { id: 999999999, nom: "x" }, tA)).statusCode).toBe(404);
    expect((await callMutation(server, "techniciens.delete", { id: 999999999 }, tA)).statusCode).toBe(404);
  });

  it("bornes zod : nom > 255, couleur non #RRGGBB, coutHoraire non décimal → 400", async () => {
    const tA = await token(UA);
    expect((await callMutation(server, "techniciens.create", { nom: "x".repeat(256) }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "C", couleur: "rouge" }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.create", { nom: "C", coutHoraire: "abc" }, tA)).statusCode).toBe(400);
  });

  it("getAll renvoie le même résultat que list (parité legacy)", async () => {
    const tA = await token(UA);
    await callMutation(server, "techniciens.create", { nom: "Parité" }, tA);
    const list = (await callQuery(server, "techniciens.list", undefined, tA)).json().result.data as Array<{ id: number }>;
    const getAll = (await callQuery(server, "techniciens.getAll", undefined, tA)).json().result.data as Array<{ id: number }>;
    expect(getAll.map((t) => t.id).sort()).toEqual(list.map((t) => t.id).sort());
  });

  it("disponibilités : setDisponibilite (upsert) + getDisponibilites scopés, anti-IDOR", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const techId = (await callMutation(server, "techniciens.create", { nom: "Dispo" }, tA)).json().result.data.id as number;
    // set OK
    const set = await callMutation(server, "techniciens.setDisponibilite", { technicienId: techId, jourSemaine: 1, heureDebut: "08:00", heureFin: "17:00", disponible: true }, tA);
    expect(set.statusCode).toBe(200);
    // upsert même jour → une seule ligne
    await callMutation(server, "techniciens.setDisponibilite", { technicienId: techId, jourSemaine: 1, heureDebut: "09:00", heureFin: "18:00", disponible: false }, tA);
    const lst = await callQuery(server, "techniciens.getDisponibilites", { technicienId: techId }, tA);
    const data = lst.json().result.data as Array<{ jourSemaine: number; heureDebut: string }>;
    expect(data.filter((d) => d.jourSemaine === 1).length).toBe(1);
    expect(data.find((d) => d.jourSemaine === 1)?.heureDebut).toBe("09:00");
    // validation zod : jourSemaine 7 → 400 ; heure mal formée → 400
    expect((await callMutation(server, "techniciens.setDisponibilite", { technicienId: techId, jourSemaine: 7, heureDebut: "08:00", heureFin: "17:00", disponible: true }, tA)).statusCode).toBe(400);
    expect((await callMutation(server, "techniciens.setDisponibilite", { technicienId: techId, jourSemaine: 2, heureDebut: "8h", heureFin: "17:00", disponible: true }, tA)).statusCode).toBe(400);
    // anti-IDOR géoloc/planning : B sur le technicien de A → set 404, get → [] (sans oracle)
    expect((await callMutation(server, "techniciens.setDisponibilite", { technicienId: techId, jourSemaine: 3, heureDebut: "08:00", heureFin: "17:00", disponible: true }, tB)).statusCode).toBe(404);
    expect((await callQuery(server, "techniciens.getDisponibilites", { technicienId: techId }, tB)).json().result.data).toEqual([]);
  });

  it("positions GPS : enregistrer + getDernierePosition scopés, anti-IDOR géoloc", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const techId = (await callMutation(server, "techniciens.create", { nom: "GPS" }, tA)).json().result.data.id as number;
    // aucune position → null
    expect((await callQuery(server, "techniciens.getDernierePosition", { technicienId: techId }, tA)).json().result.data).toBeNull();
    // enregistre 2 positions → la dernière est renvoyée
    await callMutation(server, "techniciens.enregistrerPosition", { technicienId: techId, latitude: "48.85", longitude: "2.35", batterie: 90 }, tA);
    const p2 = await callMutation(server, "techniciens.enregistrerPosition", { technicienId: techId, latitude: "45.76", longitude: "4.84", enDeplacement: true }, tA);
    expect(p2.statusCode).toBe(200);
    const last = await callQuery(server, "techniciens.getDernierePosition", { technicienId: techId }, tA);
    expect(Number(last.json().result.data.latitude)).toBeCloseTo(45.76, 2);
    // validation : latitude hors plage → 400
    expect((await callMutation(server, "techniciens.enregistrerPosition", { technicienId: techId, latitude: "120", longitude: "2.35" }, tA)).statusCode).toBe(400);
    // anti-IDOR géoloc : B ne lit/écrit pas la position du technicien de A → null / 404
    expect((await callQuery(server, "techniciens.getDernierePosition", { technicienId: techId }, tB)).json().result.data).toBeNull();
    expect((await callMutation(server, "techniciens.enregistrerPosition", { technicienId: techId, latitude: "48.85", longitude: "2.35" }, tB)).statusCode).toBe(404);
  });

  it("getLinkableUsers : propriétaire + collaborateurs du tenant, scopé (pas d'autre tenant)", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const usersA = (await callQuery(server, "techniciens.getLinkableUsers", undefined, tA)).json().result.data as Array<{ id: number }>;
    const idsA = usersA.map((u) => u.id);
    expect(idsA).toContain(UA); // propriétaire
    expect(idsA).toContain(COLLAB_A); // collaborateur
    expect(idsA).not.toContain(UB); // pas l'autre tenant
    expect(idsA).not.toContain(COLLAB_B);
    // B ne voit pas les users de A
    const idsB = ((await callQuery(server, "techniciens.getLinkableUsers", undefined, tB)).json().result.data as Array<{ id: number }>).map((u) => u.id);
    expect(idsB).toContain(UB);
    expect(idsB).not.toContain(UA);
    expect(idsB).not.toContain(COLLAB_A);
  });

  it("update partiel : ne touche pas les champs non fournis", async () => {
    const tA = await token(UA);
    const id = (await callMutation(server, "techniciens.create", { nom: "Garder", specialite: "Élec", statut: "actif" }, tA)).json().result.data.id as number;
    // update du seul statut → specialite préservée
    const maj = (await callMutation(server, "techniciens.update", { id, statut: "inactif" }, tA)).json().result.data as { specialite: string | null; statut: string; nom: string };
    expect(maj.statut).toBe("inactif");
    expect(maj.specialite).toBe("Élec");
    expect(maj.nom).toBe("Garder");
  });

  it("habilitations (parité client) : add/get/delete scopés au technicien owné ; anti-IDOR cross-tenant ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const techA = (await callMutation(server, "techniciens.create", { nom: "Hab A" }, tA)).json().result.data.id as number;
    const techB = (await callMutation(server, "techniciens.create", { nom: "Hab B" }, tB)).json().result.data.id as number;
    // 401 sans cookie
    expect((await callQuery(server, "techniciens.getHabilitations", { technicienId: techA })).statusCode).toBe(401);
    // add (date invalide ignorée → null)
    const added = await callMutation(
      server,
      "techniciens.addHabilitation",
      { technicienId: techA, type: "CACES R486", numero: "ABC", organisme: "APAVE", dateObtention: "2025-01-15", dateExpiration: "pas-une-date" },
      tA,
    );
    expect(added.statusCode).toBe(200);
    const hab = added.json().result.data as { id: number; type: string; dateObtention: string | null; dateExpiration: string | null };
    expect(hab.type).toBe("CACES R486");
    expect(hab.dateObtention).toBe("2025-01-15");
    expect(hab.dateExpiration).toBeNull(); // date invalide ignorée
    // get → liste scopée
    const list = (await callQuery(server, "techniciens.getHabilitations", { technicienId: techA }, tA)).json().result.data as Array<{ id: number }>;
    expect(list.map((h) => h.id)).toContain(hab.id);
    // ANTI-IDOR : A demande les habilitations du technicien de B → [] ; A ne peut pas en ajouter pour techB → 404
    expect((await callQuery(server, "techniciens.getHabilitations", { technicienId: techB }, tA)).json().result.data).toEqual([]);
    expect((await callMutation(server, "techniciens.addHabilitation", { technicienId: techB, type: "X" }, tA)).statusCode).toBe(404);
    // delete scopé : B ne peut pas supprimer l'habilitation de A (techA hors tenant de B) → 404
    expect((await callMutation(server, "techniciens.deleteHabilitation", { technicienId: techA, id: hab.id }, tB)).statusCode).toBe(404);
    // A supprime → success ; re-supprimer → 404 (introuvable)
    expect((await callMutation(server, "techniciens.deleteHabilitation", { technicienId: techA, id: hab.id }, tA)).statusCode).toBe(200);
    expect((await callMutation(server, "techniciens.deleteHabilitation", { technicienId: techA, id: hab.id }, tA)).statusCode).toBe(404);
  });

  it("getStats (parité client) : comptes d'interventions par statut, scopé technicien owné ; anti-IDOR → 404 ; 401", async () => {
    const tA = await token(UA);
    const tB = await token(UB);
    const techA = (await callMutation(server, "techniciens.create", { nom: "Stats A" }, tA)).json().result.data.id as number;
    const techB = (await callMutation(server, "techniciens.create", { nom: "Stats B" }, tB)).json().result.data.id as number;
    // 401 sans cookie
    expect((await callQuery(server, "techniciens.getStats", { technicienId: techA })).statusCode).toBe(401);
    // seed interventions de A pour techA : 2 terminées, 1 en_cours, 1 planifiee, 1 annulee + 1 sur un autre tech
    const autreTech = (await callMutation(server, "techniciens.create", { nom: "Autre" }, tA)).json().result.data.id as number;
    const clientA = (await admin.query('insert into clients ("artisanId", nom) values ($1,$2) returning id', [artisanA, "Client Stats"])).rows[0].id as number;
    await admin.query(
      `insert into interventions ("artisanId","clientId","technicienId",statut,titre,"dateDebut") values
       ($1,$4,$2,'terminee','i1',now()),($1,$4,$2,'terminee','i2',now()),($1,$4,$2,'en_cours','i3',now()),($1,$4,$2,'planifiee','i4',now()),($1,$4,$2,'annulee','i5',now()),($1,$4,$3,'terminee','autre',now())`,
      [artisanA, techA, autreTech, clientA],
    );
    const stats = (await callQuery(server, "techniciens.getStats", { technicienId: techA }, tA)).json().result.data as { total: number; terminees: number; enCours: number; planifiees: number };
    expect(stats).toEqual({ total: 5, terminees: 2, enCours: 1, planifiees: 1 }); // l'intervention de autreTech n'est pas comptée
    // ANTI-IDOR : A demande les stats du technicien de B → 404
    expect((await callQuery(server, "techniciens.getStats", { technicienId: techB }, tA)).statusCode).toBe(404);
    // technicien sans intervention → compteurs à 0
    expect((await callQuery(server, "techniciens.getStats", { technicienId: techB }, tB)).json().result.data).toEqual({ total: 0, terminees: 0, enCours: 0, planifiees: 0 });
  });
});
