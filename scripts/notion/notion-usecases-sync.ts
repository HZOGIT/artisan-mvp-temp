/**
 * notion-usecases-sync.ts — Upsert l'inventaire des use-cases de l'app dans une DB Notion.
 *
 * Source de vérité = le CODE (`src/modules/*​/application/**`). Notion = couche
 * d'organisation/collaboration pour le testing. Le script est ONE-WAY (repo → Notion)
 * et ne touche QUE les colonnes "machine" — jamais les colonnes éditées par un humain.
 *
 * Usage :
 *   pnpm tsx scripts/notion/notion-usecases-sync.ts            # dry-run
 *   pnpm tsx scripts/notion/notion-usecases-sync.ts --apply    # écrit dans Notion (token requis)
 *
 * Env :
 *   NOTION_TOKEN          secret de l'intégration Notion (requis pour --apply)
 *   NOTION_DATABASE_ID    DB cible existante (partagée avec l'intégration). Si absent ET
 *                         NOTION_PARENT_PAGE_ID fourni → la DB est créée puis son id est affiché.
 *   NOTION_PARENT_PAGE_ID page parente où créer la DB (si NOTION_DATABASE_ID absent)
 *   GIT_BRANCH            branche pour les permalinks GitHub (défaut: staging)
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(import.meta.dirname, "../..");   // racine du projet (scripts/notion/ → ../../)
const MODULES_DIR = join(ROOT, "apps", "api", "modules");

// Charge les secrets depuis un fichier gitignored (évite d'exposer le token en CLI).
// Priorité à process.env déjà défini. Cherche .env.notion puis .env.local.
for (const envFile of [".env.notion", ".env.staging", ".env.local"]) {
  try {
    for (const line of readFileSync(join(ROOT, envFile), "utf8").split("\n")) {
      const m = line.match(/^\s*(NOTION_\w+|GIT_BRANCH|GEMINI_\w+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fichier absent : ok */ }
}
const REPO_URL = "https://github.com/HZOGIT/artisan-mvp-temp";
const BRANCH = process.env.GIT_BRANCH ?? "staging";
const APPLY = process.argv.includes("--apply");

// Noms lisibles générés par Gemini — source de vérité dans le repo (versionné).
const NAMES_FILE = join(import.meta.dirname, "notion-usecases-names.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.0-flash";

const NOTION_TOKEN = process.env.NOTION_TOKEN ?? "";
const NOTION_VERSION = "2022-06-28";
let NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? "";
const NOTION_PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID ?? "";

// Bloc Fonctionnel : regroupement métier des modules (éditable). Fallback = module titre-casé.
const MODULE_TO_BLOC: Record<string, string> = {
  devis: "Facturation", "devis-options": "Facturation", factures: "Facturation",
  "modeles-devis": "Facturation", "relances-devis": "Facturation", signature: "Facturation",
  ecritures: "Comptabilité", comptabilite: "Comptabilité", depenses: "Comptabilité",
  "notes-de-frais": "Comptabilité", "categories-depenses": "Comptabilité",
  "regles-categorisation": "Comptabilité", "budgets-categories": "Comptabilité",
  clients: "CRM & Clients", avis: "CRM & Clients", "demandes-contact": "CRM & Clients",
  "contrats-maintenance": "CRM & Clients", "rdv-en-ligne": "CRM & Clients",
  conges: "RH", techniciens: "RH", utilisateurs: "RH", badges: "RH",
  stocks: "Achats & Stock", articles: "Achats & Stock", fournisseurs: "Achats & Stock",
  commandes: "Achats & Stock", vehicules: "Achats & Stock",
  interventions: "Terrain & Chantiers", chantiers: "Terrain & Chantiers",
  calendrier: "Terrain & Chantiers", geolocalisation: "Terrain & Chantiers",
  subscription: "Billing & Abonnement", paiement: "Billing & Abonnement",
  billing: "Billing & Abonnement", "feature-modules": "Billing & Abonnement",
  assistant: "IA & Assistant", "conseils-ia": "IA & Assistant",
  dashboard: "Pilotage", statistiques: "Pilotage", rapports: "Pilotage",
  "previsions-ca": "Pilotage", search: "Pilotage",
  auth: "Plateforme", artisan: "Plateforme", parametres: "Plateforme",
  notifications: "Plateforme", emails: "Plateforme", "modeles-email": "Plateforme",
  "config-relances": "Plateforme", activites: "Plateforme",
};

// Modules constituant le chemin critique métier (money + auth + portail public).
// Ajouter ici si un nouveau module devient critique — un re-run suffit à mettre à jour Notion.
const CRITICAL_PATH_MODULES = new Set([
  "paiement",       // Stripe : génération lien, webhook, sync
  "subscription",   // Abonnement + résiliation (legacy Stripe)
  "billing",        // Billing maison : SetupIntent, PM, cycles, dunning
  "factures",       // Facturation : création, transitions, envoi
  "devis",          // Devis : création, envoi, transitions
  "signature",      // Signature électronique
  "client-portal",  // Portail public (accès sans auth, token URL)
  "auth",           // Auth : signup, login, reset, delete
]);

// Fichiers de la couche application qui sont des PORTS/interfaces, pas des use-cases.
const PORT_SUFFIXES = ["-repository.ts", "-reader.ts", "-port.ts", "-notifier.ts", "-writer.ts", "-converter.ts", "-hasher.ts"];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UseCase {
  slug: string;
  module: string;
  bloc: string;
  nom: string;          // nom lisible dérivé
  couche: "application";
  nature: "read" | "write" | "transition" | "autre";
  fichier: string;      // chemin relatif au repo
  ligne: number;
  permalink: string;
  testsEnPlace: string[];
  cheminCritique: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction des use-cases depuis le code
// ─────────────────────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

function isPortFile(file: string): boolean {
  return PORT_SUFFIXES.some((s) => file.endsWith(s));
}

function humanize(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function natureOf(name: string): UseCase["nature"] {
  const n = name.toLowerCase();
  if (/^(get|list|find|read|fetch|search|preview|compute|calculer|count|exists?)/.test(n)) return "read";
  if (/^(create|update|delete|save|set|envoyer|generer|generate|add|remove|upsert|build|process|import|export)/.test(n)) return "write";
  if (/(transition|approuver|refuser|valider|annuler|convert|sign|cancel|confirm|bascule|status|statut)/.test(n)) return "transition";
  return "autre";
}

// Cache : pour chaque module, le contenu de ses fichiers de test, rangé par catégorie.
type ModuleTests = { unit: string[]; integ: string[]; e2e: string[] };
const moduleTestsCache = new Map<string, ModuleTests>();

function loadModuleTests(moduleDir: string): ModuleTests {
  const cached = moduleTestsCache.get(moduleDir);
  if (cached) return cached;
  const acc: ModuleTests = { unit: [], integ: [], e2e: [] };
  let files: string[] = [];
  try { files = walk(moduleDir); } catch { /* vide */ }
  for (const f of files) {
    if (!f.endsWith(".test.ts")) continue;
    const content = readFileSync(f, "utf8");
    if (/\/infra\/.*-drizzle\.test\.ts$/.test(f)) acc.integ.push(content);
    else if (/\/interface\//.test(f)) acc.e2e.push(content);
    else acc.unit.push(content); // application/ + domain/ + invariants
  }
  moduleTestsCache.set(moduleDir, acc);
  return acc;
}

// Détecte les types de tests "en place" PAR NOM de use-case (cite la fn dans un fichier de test).
function detectTests(moduleDir: string, _ucFileAbs: string, fnName: string): string[] {
  const t = loadModuleTests(moduleDir);
  const re = new RegExp(`\\b${fnName}\\b`);
  const tests: string[] = [];
  if (t.unit.some((c) => re.test(c))) tests.push("unit");
  if (t.integ.some((c) => re.test(c))) tests.push("integration-db");
  if (t.e2e.some((c) => re.test(c))) tests.push("e2e-http");
  return tests;
}

function extractUseCases(): UseCase[] {
  const modules = readdirSync(MODULES_DIR).filter((m) => {
    try { return statSync(join(MODULES_DIR, m)).isDirectory(); } catch { return false; }
  });

  const reExports = [
    /export\s+async\s+function\s+(\w+)/g,
    /export\s+function\s+(\w+)/g,
    /export\s+const\s+(\w+)\s*=\s*async\b/g,
  ];

  const out: UseCase[] = [];
  for (const module of modules) {
    const appDir = join(MODULES_DIR, module, "application");
    let files: string[] = [];
    try { files = walk(appDir); } catch { continue; } // pas de couche application
    const bloc = MODULE_TO_BLOC[module] ?? humanize(module.replace(/-/g, " "));
    const moduleDir = join(MODULES_DIR, module);

    for (const file of files) {
      if (file.endsWith(".test.ts") || isPortFile(file)) continue;
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      const seen = new Set<string>();
      for (const re of reExports) {
        for (const m of src.matchAll(re)) {
          const name = m[1];
          if (!name || seen.has(name)) continue;
          seen.add(name);
          const idx = src.slice(0, m.index).split("\n").length; // n° de ligne 1-based
          const rel = relative(ROOT, file);
          out.push({
            slug: `${module}.${name}`,
            module,
            bloc,
            nom: humanize(name),
            couche: "application",
            nature: natureOf(name),
            fichier: rel,
            ligne: idx,
            permalink: `${REPO_URL}/blob/${BRANCH}/${rel}#L${idx}`,
            testsEnPlace: detectTests(moduleDir, file, name),
            cheminCritique: CRITICAL_PATH_MODULES.has(module),
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ─────────────────────────────────────────────────────────────────────────────
// Noms lisibles (Gemini) — cache JSON versionné dans le repo
// ─────────────────────────────────────────────────────────────────────────────

function loadNames(): Record<string, string> {
  try { return JSON.parse(readFileSync(NAMES_FILE, "utf8")); } catch { return {}; }
}

function saveNames(names: Record<string, string>): void {
  const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(NAMES_FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}

async function generateNames(slugsByModule: Map<string, string[]>): Promise<Record<string, string>> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY absent — impossible de générer les noms.");
  const result: Record<string, string> = {};

  await pMap([...slugsByModule.entries()], async ([module, slugs]) => {
    const prompt =
      `Tu es expert ERP pour artisans (devis, factures, paiements, RH, stocks, interventions…).\n` +
      `Pour chaque use-case TypeScript du module "${module}", génère un intitulé métier en français,\n` +
      `clair et concis (3 à 5 mots), compréhensible par un utilisateur non technique.\n\n` +
      `Réponds UNIQUEMENT avec un objet JSON valide (sans markdown, sans commentaire). Format :\n` +
      `{ "module.nomFonction": "Intitulé métier" }\n\n` +
      `Use-cases :\n${slugs.map((s) => `- ${s}`).join("\n")}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) },
    );
    if (!res.ok) { console.warn(`   ⚠️  Gemini erreur module ${module}: ${res.status}`); return; }

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("pas de JSON dans la réponse");
      Object.assign(result, JSON.parse(jsonMatch[0]));
    } catch (e) {
      console.warn(`   ⚠️  Gemini parse erreur module ${module}: ${e}`);
    }
  }, 5);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Notion (fetch natif)
// ─────────────────────────────────────────────────────────────────────────────

async function notion(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.all(items.slice(i, i + concurrency).map(fn));
    results.push(...batch);
  }
  return results;
}

async function notionWithRetry(path: string, method: string, body?: unknown, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try { return await notion(path, method, body); }
    catch (e: any) {
      if (e.message?.includes("429") && attempt < retries - 1) await sleep(1000 * (attempt + 1));
      else throw e;
    }
  }
}

// Schéma de la DB. ⚠️ machine = écrit par le script ; humain = jamais touché après création.
// Nom est le TITRE Notion (visible, non cachable) → libellé métier lisible.
// Slug est rich_text → identifiant technique, cachable via les vues.
function databaseSchema() {
  return {
    Nom: { title: {} },                                    // machine — titre Notion (généré Gemini)
    Slug: { rich_text: {} },                               // machine — clé technique (cachable)
    "Bloc Fonctionnel": { select: {} },                    // machine
    Module: { rich_text: {} },                             // machine
    Couche: { select: {} },                                // machine
    Nature: { select: {} },                                // machine
    "Tests en place": { multi_select: {} },                // machine
    "Fichier source": { rich_text: {} },                   // machine
    "Chemin critique": { checkbox: {} },                   // machine (défini dans CRITICAL_PATH_MODULES)
    "Présent dans le code": { checkbox: {} },              // machine
    "Dernier sync": { date: {} },                          // machine
    "Tests cibles": { multi_select: {} },                  // humain
    Statut: { select: { options: [
      { name: "À faire" }, { name: "En cours" }, { name: "Couvert" }, { name: "À revoir" },
    ] } },                                                  // humain
    Priorité: { select: { options: [
      { name: "P0" }, { name: "P1" }, { name: "P2" }, { name: "P3" },
    ] } },                                                  // humain
    Owner: { people: {} },                                 // humain
  };
}

// Propriétés MACHINE uniquement (envoyées en create ET en update).
function machineProps(uc: UseCase) {
  return {
    Nom: { title: [{ text: { content: uc.nom } }] },
    Slug: { rich_text: [{ text: { content: uc.slug } }] },
    "Bloc Fonctionnel": { select: { name: uc.bloc } },
    Module: { rich_text: [{ text: { content: uc.module } }] },
    Couche: { select: { name: uc.couche } },
    Nature: { select: { name: uc.nature } },
    "Tests en place": { multi_select: uc.testsEnPlace.map((name) => ({ name })) },
    "Fichier source": { rich_text: [{ text: { content: uc.permalink } }] },
    "Chemin critique": { checkbox: uc.cheminCritique },
    "Présent dans le code": { checkbox: true },
    "Dernier sync": { date: { start: new Date().toISOString() } },
  };
}

async function ensureDatabase(): Promise<string> {
  // Cas 1 : DB fournie → on garantit son schéma (titre→Slug + colonnes manquantes).
  if (NOTION_DATABASE_ID) {
    await ensureSchema(NOTION_DATABASE_ID);
    return NOTION_DATABASE_ID;
  }
  // Cas 2 : pas de DB mais une page parente → on crée la DB avec le bon schéma.
  if (!NOTION_PARENT_PAGE_ID) {
    throw new Error("Ni NOTION_DATABASE_ID ni NOTION_PARENT_PAGE_ID — impossible de cibler/créer la DB.");
  }
  const db = await notion("/databases", "POST", {
    parent: { type: "page_id", page_id: NOTION_PARENT_PAGE_ID },
    title: [{ type: "text", text: { content: "Use-cases & Testing" } }],
    properties: databaseSchema(),
  });
  console.log(`\n✅ DB Notion créée. Ajoute ceci à ton env :\n   NOTION_DATABASE_ID=${db.id}\n`);
  return db.id;
}

// Garantit, sur une DB existante (potentiellement vide / créée à la main), que toutes les
// colonnes attendues existent — sans rien supprimer. Renomme la colonne titre par défaut en "Slug".
async function ensureSchema(dbId: string): Promise<void> {
  const db: any = await notion(`/databases/${dbId}`, "GET");
  const props: Record<string, any> = db.properties ?? {};

  // 1) La propriété "titre" (il y en a exactement une) doit s'appeler "Nom".
  const titleEntry = Object.entries(props).find(([, p]: any) => p.type === "title");
  if (titleEntry && titleEntry[0] !== "Nom") {
    await notion(`/databases/${dbId}`, "PATCH", { properties: { [titleEntry[0]]: { name: "Nom" } } });
  }

  // 2) Ajoute les colonnes manquantes (le titre est déjà géré ci-dessus → on l'exclut).
  const wanted = databaseSchema();
  const toAdd: Record<string, any> = {};
  for (const [name, def] of Object.entries(wanted)) {
    if (name === "Nom") continue;
    if (!props[name]) toAdd[name] = def;
  }
  if (Object.keys(toAdd).length) {
    await notion(`/databases/${dbId}`, "PATCH", { properties: toAdd });
    console.log(`   Schéma : ${Object.keys(toAdd).length} colonne(s) ajoutée(s) → ${Object.keys(toAdd).join(", ")}`);
  } else {
    console.log("   Schéma : déjà complet.");
  }
}

// Récupère toutes les pages existantes → Map slug → pageId.
async function fetchExisting(dbId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const page: any = await notion(`/databases/${dbId}/query`, "POST", cursor ? { start_cursor: cursor } : {});
    for (const row of page.results) {
      const slug = row.properties?.Slug?.rich_text?.[0]?.plain_text;
      if (slug) map.set(slug, row.id);
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const useCases = extractUseCases();

  // Récap extraction
  const byBloc = new Map<string, number>();
  for (const uc of useCases) byBloc.set(uc.bloc, (byBloc.get(uc.bloc) ?? 0) + 1);
  console.log(`\n📦 ${useCases.length} use-cases extraits sur ${new Set(useCases.map((u) => u.module)).size} modules.`);
  console.log("   Par bloc fonctionnel :");
  for (const [bloc, n] of [...byBloc].sort((a, b) => b[1] - a[1])) console.log(`     ${n.toString().padStart(3)}  ${bloc}`);
  const withTests = useCases.filter((u) => u.testsEnPlace.length).length;
  console.log(`   Avec ≥1 type de test détecté : ${withTests}/${useCases.length}`);

  // ── Noms lisibles (Gemini) ──────────────────────────────────────────────────
  const names = loadNames();
  const missing = useCases.filter((uc) => !names[uc.slug]);
  if (missing.length > 0) {
    console.log(`\n🤖 Génération Gemini : ${missing.length} noms manquants…`);
    const byModule = new Map<string, string[]>();
    for (const uc of missing) byModule.set(uc.module, [...(byModule.get(uc.module) ?? []), uc.slug]);
    const generated = await generateNames(byModule);
    Object.assign(names, generated);
    saveNames(names);
    console.log(`   ✅ ${Object.keys(generated).length}/${missing.length} noms générés → ${NAMES_FILE}`);
  }
  // Applique les noms aux use-cases (fallback = humanize déjà en place).
  for (const uc of useCases) { if (names[uc.slug]) uc.nom = names[uc.slug]; }

  // Garantit l'unicité de Nom (titre Notion) — dedup par module si collision globale.
  const nomToSlugs = new Map<string, string[]>();
  for (const uc of useCases) nomToSlugs.set(uc.nom, [...(nomToSlugs.get(uc.nom) ?? []), uc.slug]);
  const conflictedNoms = new Set([...nomToSlugs.entries()].filter(([, s]) => s.length > 1).map(([n]) => n));
  if (conflictedNoms.size > 0) {
    console.log(`   ⚠️  ${conflictedNoms.size} noms dupliqués → disambiguïsation par module.`);
    for (const uc of useCases) {
      if (conflictedNoms.has(uc.nom)) uc.nom = `${uc.nom} — ${uc.module}`;
    }
  }

  if (!APPLY) {
    console.log("\n— DRY-RUN — (ajoute --apply pour écrire dans Notion). Échantillon :");
    for (const uc of useCases.slice(0, 15)) {
      console.log(`   ${uc.slug.padEnd(48)}  "${uc.nom}"`);
    }
    if (!NOTION_TOKEN) console.log("\n(ℹ️  NOTION_TOKEN absent : extraction validée sans appel réseau.)");
    return;
  }

  if (!NOTION_TOKEN) throw new Error("--apply nécessite NOTION_TOKEN.");
  const dbId = await ensureDatabase();
  NOTION_DATABASE_ID = dbId;

  console.log("\n🔄 Synchronisation Notion…");
  const existing = await fetchExisting(dbId);
  let created = 0, updated = 0;
  const currentSlugs = new Set(useCases.map((u) => u.slug));

  await pMap(useCases, async (uc) => {
    const pageId = existing.get(uc.slug);
    if (pageId) {
      await notionWithRetry(`/pages/${pageId}`, "PATCH", { properties: machineProps(uc) });
      updated++;
    } else {
      await notionWithRetry("/pages", "POST", { parent: { database_id: dbId }, properties: machineProps(uc) });
      created++;
    }
  }, 5);

  // Orphelins : use-cases disparus du code → on les marque (pas de suppression destructive).
  let orphans = 0;
  const orphanEntries = [...existing.entries()].filter(([slug]) => !currentSlugs.has(slug));
  await pMap(orphanEntries, async ([, pageId]) => {
    await notionWithRetry(`/pages/${pageId}`, "PATCH", {
      properties: { "Présent dans le code": { checkbox: false }, "Dernier sync": { date: { start: new Date().toISOString() } } },
    });
    orphans++;
  }, 5);

  console.log(`\n✅ Terminé. Créés: ${created} · Mis à jour: ${updated} · Orphelins marqués: ${orphans}`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
