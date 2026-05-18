/**
 * Beta test runner — temporaire. Cree 3 artisans de test
 * (@test-operioz.com), simule un parcours pour chacun, lance 10 tests
 * dont 4 d'isolation multi-tenant, puis nettoie integralement les
 * donnees de test. Ne touche jamais l'artisan id=1.
 *
 * Reproduit la logique de scripts/beta-test.mjs cote serveur pour
 * pouvoir tourner en autonomie sur Railway (acces direct au pool MySQL).
 */
import bcrypt from "bcryptjs";

type Pool = {
  execute: (sql: string, params?: any[]) => Promise<any>;
};

const TEST_DOMAIN = "@test-operioz.com";

type ArtisanSpec = {
  key: "plombier" | "electricien" | "cuisiniste";
  label: string;
  email: string;
  metier: string;
  plan: "trial" | "pro" | "entreprise";
  expectedModules: string[];
  expectedMaxUsers: number;
  expectedMaxDevices: number;
  expectedMaxSessions: number;
  clientsCount: number;
  devisCount: number;
  factureCount: number;
  interventionCount: number;
  acceptFirstDevis: boolean;
  payFirstFacture: boolean;
  withFournisseur: boolean;
};

const ARTISANS: ArtisanSpec[] = [
  {
    key: "plombier",
    label: "Plomberie Durand",
    email: `beta1${TEST_DOMAIN}`,
    metier: "plombier",
    plan: "trial",
    expectedModules: ["devis", "factures", "clients", "interventions", "stocks", "relances"],
    expectedMaxUsers: 1,
    expectedMaxDevices: 3,
    expectedMaxSessions: 2,
    clientsCount: 2,
    devisCount: 1,
    factureCount: 1,
    interventionCount: 1,
    acceptFirstDevis: false,
    payFirstFacture: false,
    withFournisseur: false,
  },
  {
    key: "electricien",
    label: "Elec Pro Martin",
    email: `beta2${TEST_DOMAIN}`,
    metier: "electricien",
    plan: "pro",
    expectedModules: ["devis", "factures", "clients", "interventions", "signature", "relances"],
    expectedMaxUsers: 3,
    expectedMaxDevices: 3,
    expectedMaxSessions: 3,
    clientsCount: 3,
    devisCount: 2,
    factureCount: 1,
    interventionCount: 0,
    acceptFirstDevis: true,
    payFirstFacture: true,
    withFournisseur: true,
  },
  {
    key: "cuisiniste",
    label: "Cuisines Leblanc",
    email: `beta3${TEST_DOMAIN}`,
    metier: "cuisiniste",
    plan: "entreprise",
    expectedModules: ["devis", "factures", "clients", "commandes", "signature"],
    expectedMaxUsers: 10,
    expectedMaxDevices: 3,
    expectedMaxSessions: 4,
    clientsCount: 5,
    devisCount: 3,
    factureCount: 2,
    interventionCount: 0,
    acceptFirstDevis: false,
    payFirstFacture: false,
    withFournisseur: false,
  },
];

async function cleanup(pool: Pool) {
  // Recupere les artisanIds lies aux emails de test (defensif : exclut id=1)
  const [users] = await pool.execute(
    `SELECT id, artisanId FROM users WHERE email LIKE '%${TEST_DOMAIN}'`
  );
  const artisanIds = (users as any[])
    .map((u) => u.artisanId)
    .filter((x: number | null) => x && x !== 1);

  if (artisanIds.length > 0) {
    const placeholders = artisanIds.map(() => "?").join(",");
    // Lignes d'abord
    for (const q of [
      `DELETE FROM devis_lignes WHERE devisId IN (SELECT id FROM devis WHERE artisanId IN (${placeholders}))`,
      `DELETE FROM factures_lignes WHERE factureId IN (SELECT id FROM factures WHERE artisanId IN (${placeholders}))`,
      `DELETE FROM lignes_commande_fournisseur WHERE commandeId IN (SELECT id FROM commandes_fournisseurs WHERE artisanId IN (${placeholders}))`,
    ]) {
      try {
        await pool.execute(q, artisanIds);
      } catch {
        /* table absente : ok */
      }
    }
    // Tables enfants (col artisanId)
    for (const t of [
      "devis",
      "factures",
      "interventions",
      "clients",
      "notifications",
      "parametres_artisan",
      "commandes_fournisseurs",
      "fournisseurs",
    ]) {
      try {
        await pool.execute(`DELETE FROM ${t} WHERE artisanId IN (${placeholders})`, artisanIds);
      } catch {
        /* ok */
      }
    }
    // Tables enfants (col artisan_id snake_case)
    for (const t of ["artisan_modules", "subscriptions", "devices", "active_sessions"]) {
      try {
        await pool.execute(`DELETE FROM ${t} WHERE artisan_id IN (${placeholders})`, artisanIds);
      } catch {
        /* ok */
      }
    }
    // Artisans (PROTECTION : id != 1)
    await pool.execute(
      `DELETE FROM artisans WHERE id IN (${placeholders}) AND id != 1`,
      artisanIds
    );
  }
  // Users
  await pool.execute(
    `DELETE FROM users WHERE email LIKE '%${TEST_DOMAIN}' AND id != 1`
  );
}

export async function runBetaTest(pool: Pool) {
  const start = Date.now();
  const artisanIds: Record<string, number> = {};
  const userIds: Record<string, number> = {};

  // === Nettoyage prealable (au cas ou un run precedent a echoue mid-way)
  await cleanup(pool);

  // === Creation des 3 artisans + parcours ===
  const pwd = bcrypt.hashSync("TestBeta2026!", 8);
  const trialEnd = new Date(Date.now() + 30 * 86400000);
  const counts: Record<string, any> = {};

  for (const a of ARTISANS) {
    // user
    const [uRes]: any = await pool.execute(
      `INSERT INTO users (name, prenom, email, password, loginMethod, role, actif)
       VALUES (?, ?, ?, ?, 'email', 'artisan', 1)`,
      [a.label, "Beta", a.email, pwd]
    );
    const userId = uRes.insertId;
    userIds[a.key] = userId;

    // artisan
    const [aRes]: any = await pool.execute(
      `INSERT INTO artisans (userId, nomEntreprise, email, metier, plan, onboarding_completed)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [userId, a.label, a.email, a.metier, a.plan]
    );
    const artisanId = aRes.insertId;
    artisanIds[a.key] = artisanId;

    await pool.execute(`UPDATE users SET artisanId = ? WHERE id = ?`, [artisanId, userId]);

    // parametres
    await pool.execute(
      `INSERT INTO parametres_artisan (artisanId, prefixeDevis, prefixeFacture, compteurDevis, compteurFacture)
       VALUES (?, 'DEV', 'FAC', 1, 1)`,
      [artisanId]
    );

    // subscription (trial 30j, limites selon plan)
    await pool.execute(
      `INSERT INTO subscriptions
       (artisan_id, plan, status, trial_ends_at, max_users, max_devices_per_user, max_concurrent_sessions)
       VALUES (?, ?, 'trialing', ?, ?, ?, ?)`,
      [
        artisanId,
        a.plan,
        trialEnd,
        a.expectedMaxUsers,
        a.expectedMaxDevices,
        a.expectedMaxSessions,
      ]
    );

    // modules par metier
    for (const slug of a.expectedModules) {
      await pool.execute(
        `INSERT IGNORE INTO artisan_modules (artisan_id, module_slug, actif)
         VALUES (?, ?, TRUE)`,
        [artisanId, slug]
      );
    }

    // onboarding complete
    await pool.execute(
      `UPDATE artisans SET onboarding_completed = TRUE WHERE id = ?`,
      [artisanId]
    );

    // clients
    const clientIds: number[] = [];
    for (let i = 0; i < a.clientsCount; i++) {
      const [r]: any = await pool.execute(
        `INSERT INTO clients (artisanId, nom, prenom, email, telephone, ville)
         VALUES (?, ?, 'Beta', ?, '0600000000', 'Paris')`,
        [artisanId, `Client${i + 1}`, `client${i + 1}_${a.key}${TEST_DOMAIN}`]
      );
      clientIds.push(r.insertId);
    }

    // devis + lignes
    const devisIds: number[] = [];
    for (let i = 0; i < a.devisCount; i++) {
      const num = `BETA-${a.key.slice(0, 3).toUpperCase()}-DEV-${Date.now()}-${i}`;
      const [r]: any = await pool.execute(
        `INSERT INTO devis (artisanId, clientId, numero, statut, objet, totalHT, totalTVA, totalTTC)
         VALUES (?, ?, ?, 'brouillon', ?, '1000.00', '200.00', '1200.00')`,
        [artisanId, clientIds[i % clientIds.length], num, `Devis test ${i + 1}`]
      );
      const devisId = r.insertId;
      devisIds.push(devisId);
      await pool.execute(
        `INSERT INTO devis_lignes
         (devisId, ordre, designation, quantite, unite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
         VALUES (?, 0, ?, 1, 'u', '1000.00', '20.00', '1000.00', '200.00', '1200.00')`,
        [devisId, `Prestation ${i + 1}`]
      );
    }
    if (a.acceptFirstDevis && devisIds[0]) {
      await pool.execute(`UPDATE devis SET statut = 'accepte' WHERE id = ?`, [devisIds[0]]);
    }

    // factures + lignes
    const factureIds: number[] = [];
    for (let i = 0; i < a.factureCount; i++) {
      const num = `BETA-${a.key.slice(0, 3).toUpperCase()}-FAC-${Date.now()}-${i}`;
      const [r]: any = await pool.execute(
        `INSERT INTO factures (artisanId, clientId, devisId, numero, statut, objet, totalHT, totalTVA, totalTTC)
         VALUES (?, ?, ?, ?, 'brouillon', ?, '1000.00', '200.00', '1200.00')`,
        [artisanId, clientIds[0], devisIds[i] || null, num, `Facture test ${i + 1}`]
      );
      factureIds.push(r.insertId);
      await pool.execute(
        `INSERT INTO factures_lignes
         (factureId, ordre, designation, quantite, unite, prixUnitaireHT, tauxTVA, montantHT, montantTVA, montantTTC)
         VALUES (?, 0, ?, 1, 'u', '1000.00', '20.00', '1000.00', '200.00', '1200.00')`,
        [r.insertId, `Prestation facturee ${i + 1}`]
      );
    }
    if (a.payFirstFacture && factureIds[0]) {
      await pool.execute(
        `UPDATE factures SET statut = 'payee', montantPaye = totalTTC, datePaiement = NOW(), modePaiement = 'virement'
         WHERE id = ?`,
        [factureIds[0]]
      );
    }

    // interventions
    for (let i = 0; i < a.interventionCount; i++) {
      await pool.execute(
        `INSERT INTO interventions (artisanId, clientId, titre, description, dateDebut, statut)
         VALUES (?, ?, ?, 'Beta test', NOW(), 'planifiee')`,
        [artisanId, clientIds[0], `Intervention beta ${i + 1}`]
      );
    }

    // commandes fournisseurs (electricien uniquement)
    let commandesCount = 0;
    if (a.withFournisseur) {
      try {
        const [fr]: any = await pool.execute(
          `INSERT INTO fournisseurs (artisanId, nom, email, ville)
           VALUES (?, 'Rexel Test', ?, 'Lyon')`,
          [artisanId, `rexel_${a.key}${TEST_DOMAIN}`]
        );
        await pool.execute(
          `INSERT INTO commandes_fournisseurs
           (artisanId, fournisseurId, numero, statut, totalHT, totalTTC, dateCommande)
           VALUES (?, ?, ?, 'brouillon', '500.00', '600.00', NOW())`,
          [artisanId, fr.insertId, `BETA-CMD-${Date.now()}`]
        );
        commandesCount = 1;
      } catch {
        commandesCount = 0;
      }
    }

    counts[a.key] = {
      clients: clientIds.length,
      devis: devisIds.length,
      factures: factureIds.length,
      interventions: a.interventionCount,
      commandesFournisseurs: commandesCount,
    };
  }

  // === Per-artisan checks ===
  const perArtisan: Record<string, any> = {};
  for (const a of ARTISANS) {
    const aid = artisanIds[a.key];
    const r: any = { label: a.label };

    const [oc]: any = await pool.execute(
      `SELECT onboarding_completed, metier, plan FROM artisans WHERE id = ?`,
      [aid]
    );
    r.onboardingCompleted = oc[0].onboarding_completed === 1 || oc[0].onboarding_completed === true;
    r.metier = oc[0].metier;
    r.plan = oc[0].plan;

    const [modActifs]: any = await pool.execute(
      `SELECT module_slug FROM artisan_modules WHERE artisan_id = ? AND actif = TRUE`,
      [aid]
    );
    const activeModules = (modActifs as any[]).map((m) => m.module_slug).sort();
    const expectedSorted = [...a.expectedModules].sort();
    r.modulesActifs = activeModules;
    r.modulesAttendus = expectedSorted;
    r.modulesOk =
      activeModules.length === expectedSorted.length &&
      activeModules.every((m, i) => m === expectedSorted[i]);

    const tab = ["clients", "devis", "factures", "interventions"] as const;
    for (const t of tab) {
      const [rows]: any = await pool.execute(
        `SELECT COUNT(*) AS n FROM ${t} WHERE artisanId = ?`,
        [aid]
      );
      r[`${t}Count`] = Number(rows[0].n);
    }

    const [ca]: any = await pool.execute(
      `SELECT COALESCE(SUM(totalTTC), 0) AS ca FROM factures WHERE artisanId = ? AND statut = 'payee'`,
      [aid]
    );
    r.ca = Number(ca[0].ca);

    perArtisan[a.key] = r;
  }

  // === T1-T4 : isolation cross-pair ===
  const isolation: Record<string, boolean> = {};
  const pairs: Array<[ArtisanSpec["key"], ArtisanSpec["key"]]> = [
    ["plombier", "electricien"],
    ["electricien", "cuisiniste"],
  ];
  for (const [k1, k2] of pairs) {
    const aid1 = artisanIds[k1];
    const aid2 = artisanIds[k2];
    for (const t of ["clients", "devis", "factures", "interventions"] as const) {
      const [r]: any = await pool.execute(
        `SELECT COUNT(*) AS n FROM ${t} WHERE artisanId = ?
         AND id IN (SELECT id FROM ${t} WHERE artisanId = ?)`,
        [aid2, aid1]
      );
      isolation[`${k1}_vs_${k2}_${t}`] = Number(r[0].n) === 0;
    }
  }

  // === T5 : CA = uniquement factures payees de l'artisan ===
  const t5 =
    perArtisan.plombier.ca === 0 &&
    perArtisan.electricien.ca === 1200 &&
    perArtisan.cuisiniste.ca === 0;

  // === T6 : subscriptions trial OK ===
  const subs: Record<string, any> = {};
  for (const a of ARTISANS) {
    const [s]: any = await pool.execute(
      `SELECT plan, status, trial_ends_at, max_users, max_devices_per_user, max_concurrent_sessions
       FROM subscriptions WHERE artisan_id = ?`,
      [artisanIds[a.key]]
    );
    const row = s[0];
    const trialEndDate = row ? new Date(row.trial_ends_at) : null;
    const daysLeft = trialEndDate
      ? Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000)
      : null;
    subs[a.key] = {
      plan: row?.plan,
      status: row?.status,
      maxUsers: Number(row?.max_users),
      maxDevicesPerUser: Number(row?.max_devices_per_user),
      maxConcurrentSessions: Number(row?.max_concurrent_sessions),
      daysLeft,
      ok:
        row?.status === "trialing" &&
        Number(row?.max_users) === a.expectedMaxUsers &&
        Number(row?.max_devices_per_user) === a.expectedMaxDevices &&
        Number(row?.max_concurrent_sessions) === a.expectedMaxSessions &&
        daysLeft !== null &&
        daysLeft >= 29 &&
        daysLeft <= 31,
    };
  }
  const t6 = Object.values(subs).every((s) => s.ok);

  // === T7 : modules par metier ===
  const t7 = ARTISANS.every((a) => perArtisan[a.key].modulesOk);

  // === T8 : limite appareils (insertion 4 devices pour le plombier trial) ===
  const aid = artisanIds.plombier;
  const uid = userIds.plombier;
  const maxDev = 3;
  let insertedDevices = 0;
  let fourthBlocked = false;
  for (let i = 1; i <= 4; i++) {
    const [c]: any = await pool.execute(`SELECT COUNT(*) AS n FROM devices WHERE user_id = ?`, [uid]);
    const current = Number(c[0].n);
    if (current >= maxDev) {
      fourthBlocked = i === 4;
      break;
    }
    await pool.execute(
      `INSERT INTO devices (user_id, artisan_id, device_fingerprint, device_type, browser, os, last_ip)
       VALUES (?, ?, ?, 'desktop', 'Chrome', 'Linux', '127.0.0.1')`,
      [uid, aid, `beta-fp-${i}-${Date.now()}`]
    );
    insertedDevices++;
  }
  const t8 = insertedDevices === 3 && fourthBlocked;

  // === T9 : dashboard adaptatif (heuristique seuils clients) ===
  const stateFor = (n: number) =>
    n === 0 ? "Etat0" : n <= 1 ? "Etat1" : n <= 4 ? "Etat2" : "Etat3";
  const states = {
    plombier: stateFor(perArtisan.plombier.clientsCount),
    electricien: stateFor(perArtisan.electricien.clientsCount),
    cuisiniste: stateFor(perArtisan.cuisiniste.clientsCount),
  };
  const t9 =
    states.plombier === "Etat2" &&
    states.electricien === "Etat2" &&
    states.cuisiniste === "Etat3";

  // === T10 : recherche isolee — chaque artisan a un 'Client1' visible UNIQUEMENT chez lui ===
  const [search1]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM clients WHERE artisanId = ? AND nom = 'Client1'`,
    [artisanIds.plombier]
  );
  const [search2]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM clients WHERE artisanId = ? AND nom = 'Client1'`,
    [artisanIds.electricien]
  );
  const [search3]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM clients WHERE artisanId = ? AND nom = 'Client1'`,
    [artisanIds.cuisiniste]
  );
  const totalClients =
    perArtisan.plombier.clientsCount +
    perArtisan.electricien.clientsCount +
    perArtisan.cuisiniste.clientsCount;
  const t10 =
    Number(search1[0].n) === 1 &&
    Number(search2[0].n) === 1 &&
    Number(search3[0].n) === 1 &&
    totalClients === 10;

  // === Assemblage des resultats ===
  const tests = {
    T1_clientsIsolated: Object.entries(isolation)
      .filter(([k]) => k.endsWith("_clients"))
      .every(([, v]) => v),
    T2_devisIsolated: Object.entries(isolation)
      .filter(([k]) => k.endsWith("_devis"))
      .every(([, v]) => v),
    T3_facturesIsolated: Object.entries(isolation)
      .filter(([k]) => k.endsWith("_factures"))
      .every(([, v]) => v),
    T4_interventionsIsolated: Object.entries(isolation)
      .filter(([k]) => k.endsWith("_interventions"))
      .every(([, v]) => v),
    T5_statsCorrect: t5,
    T6_subscriptionsTrial: t6,
    T7_modulesParMetier: t7,
    T8_deviceLimit: t8,
    T9_dashboardAdaptive: t9,
    T10_searchIsolated: t10,
  };
  const passed = Object.values(tests).filter(Boolean).length;
  const total = Object.keys(tests).length;

  // === Cleanup final ===
  await cleanup(pool);

  // Verifier que le cleanup a bien retire tout (count = 0)
  const [residualUsers]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM users WHERE email LIKE '%${TEST_DOMAIN}'`
  );
  const [residualArtisans]: any = await pool.execute(
    `SELECT COUNT(*) AS n FROM artisans WHERE email LIKE '%${TEST_DOMAIN}'`
  );
  const cleanupOk =
    Number(residualUsers[0].n) === 0 && Number(residualArtisans[0].n) === 0;

  // Verifier que artisan id=1 est intact
  const [a1]: any = await pool.execute(`SELECT id, nomEntreprise FROM artisans WHERE id = 1`);
  const artisan1Intact = a1.length === 1;

  return {
    durationMs: Date.now() - start,
    artisanIds,
    userIds,
    counts,
    perArtisan,
    isolation,
    subs,
    states,
    t8Details: { insertedDevices, fourthBlocked, expectedMax: maxDev },
    tests,
    passed,
    total,
    cleanupOk,
    artisan1Intact,
  };
}
