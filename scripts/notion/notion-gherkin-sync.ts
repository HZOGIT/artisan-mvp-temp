/**
 * notion-gherkin-sync.ts — Upsert les scénarios Gherkin (dossier `gherkin/`) dans une DB Notion semi-éditable.
 *
 * Source de vérité = les fichiers `.feature` versionnés (`gherkin/<module>/*.feature`).
 * Notion = couche d'organisation/collaboration. ONE-WAY (repo → Notion), idempotent (upsert par Slug),
 * ne touche QUE les colonnes "machine" — jamais les colonnes éditées par un humain (Statut, Priorité…).
 *
 * Usage :
 *   pnpm tsx scripts/notion/notion-gherkin-sync.ts            # dry-run (parse + récap, aucun appel réseau d'écriture)
 *   pnpm tsx scripts/notion/notion-gherkin-sync.ts --apply    # écrit dans Notion (NOTION_TOKEN requis)
 *
 * Env (lu depuis .env.notion / .env.staging / .env.local) :
 *   NOTION_TOKEN                    secret de l'intégration (requis pour --apply)
 *   NOTION_GHERKIN_DATABASE_ID      DB cible existante. Absente → création automatique.
 *   NOTION_GHERKIN_PARENT_PAGE_ID   page parente où créer la DB. Absente → dérivée de la page parente
 *                                   de NOTION_DATABASE_ID (DB déjà partagée avec l'intégration).
 *   GIT_BRANCH                      branche pour les permalinks GitHub (défaut: staging)
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const GHERKIN_DIR = join(ROOT, "gherkin");

for (const envFile of [".env.notion", ".env.staging", ".env.local"]) {
  try {
    for (const line of readFileSync(join(ROOT, envFile), "utf8").split("\n")) {
      const m = line.match(/^\s*(NOTION_\w+|GIT_BRANCH)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* fichier absent : ok */ }
}

const REPO_URL = "https://github.com/HZOGIT/artisan-mvp-temp";
const BRANCH = process.env.GIT_BRANCH ?? "staging";
const APPLY = process.argv.includes("--apply");
const NOTION_TOKEN = process.env.NOTION_TOKEN ?? "";
const NOTION_VERSION = "2022-06-28";
let NOTION_DATABASE_ID = process.env.NOTION_GHERKIN_DATABASE_ID ?? "";
const NOTION_PARENT_PAGE_ID = process.env.NOTION_GHERKIN_PARENT_PAGE_ID ?? "";
const NOTION_SIBLING_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? "";

const NATURE_TAGS = new Set(["nominal", "erreur", "edge", "securite"]);

interface Scenario {
  slug: string;
  module: string;
  bloc: string;
  modules: string[];
  nom: string;
  nature: string;
  tags: string[];
  gherkin: string;
  fichier: string;
  permalink: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing des .feature (format maison contrôlé — pas de dépendance gherkin)
// ─────────────────────────────────────────────────────────────────────────────

function walkFeatures(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkFeatures(p));
    else if (entry.endsWith(".feature")) out.push(p);
  }
  return out;
}

function kebab(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tagValues(tags: string[], prefix: string): string[] {
  const hit = tags.find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length).split(",").map((x) => x.trim()).filter(Boolean) : [];
}

function parseFeatureFile(abs: string): Scenario[] {
  const rel = relative(ROOT, abs);
  const module = relative(GHERKIN_DIR, abs).split(/[/\\]/)[0];
  const relNoExt = relative(GHERKIN_DIR, abs).replace(/\.feature$/, "");
  const lines = readFileSync(abs, "utf8").split("\n");

  const out: Scenario[] = [];
  let featureTags: string[] = [];
  let pending: string[] = [];
  let cur: { name: string; tags: string[]; steps: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const allTags = [...featureTags, ...cur.tags];
    const bloc = tagValues(allTags, "@bloc:")[0] ?? "";
    const modules = tagValues(allTags, "@modules:");
    const bare = allTags.filter((t) => !t.startsWith("@bloc:") && !t.startsWith("@modules:")).map((t) => t.replace(/^@/, ""));
    const nature = bare.find((t) => NATURE_TAGS.has(t)) ?? "autre";
    const tags = bare.filter((t) => !NATURE_TAGS.has(t));
    const steps = cur.steps.filter((l) => l.trim().length > 0);
    const gherkin = [`Scénario: ${cur.name}`, ...steps].join("\n");
    out.push({
      slug: `${relNoExt}#${kebab(cur.name)}`,
      module, bloc, modules, nom: cur.name, nature, tags, gherkin,
      fichier: rel,
      permalink: `${REPO_URL}/blob/${BRANCH}/${rel}`,
    });
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#") || line.length === 0) { if (cur) cur.steps.push(raw); continue; }
    if (line.startsWith("@")) { pending.push(...line.split(/\s+/).filter((t) => t.startsWith("@"))); continue; }
    if (/^(Fonctionnalité|Feature)\s*:/i.test(line)) { featureTags = pending; pending = []; continue; }
    const sm = line.match(/^(Scénario|Scenario)\s*:\s*(.*)$/i);
    if (sm) { flush(); cur = { name: sm[2].trim(), tags: pending, steps: [] }; pending = []; continue; }
    if (cur) cur.steps.push(raw);
  }
  flush();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Notion (fetch natif) — même pattern que notion-usecases-sync.ts
// ─────────────────────────────────────────────────────────────────────────────

async function notion(path: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${method} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notionWithRetry(path: string, method: string, body?: unknown, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try { return await notion(path, method, body); }
    catch (e: any) {
      if (e.message?.includes("429") && attempt < retries - 1) await sleep(1000 * (attempt + 1));
      else throw e;
    }
  }
}

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    results.push(...await Promise.all(items.slice(i, i + concurrency).map(fn)));
  }
  return results;
}

// Schéma DB. machine = écrit par le script ; humain = posé à la création, jamais réécrit.
function databaseSchema() {
  return {
    Nom: { title: {} },                                    // machine — titre du scénario
    Slug: { rich_text: {} },                               // machine — clé upsert
    Bloc: { select: {} },                                  // machine
    Module: { select: {} },                                // machine — dossier
    Modules: { multi_select: {} },                         // machine — modules traversés (cross-module)
    Nature: { select: {} },                                // machine
    Tags: { multi_select: {} },                            // machine
    Gherkin: { rich_text: {} },                            // machine — corps Scénario:
    "Fichier source": { rich_text: {} },                   // machine — permalink
    "Présent dans le repo": { checkbox: {} },              // machine
    "Dernier sync": { date: {} },                          // machine
    Statut: { select: { options: [
      { name: "À valider" }, { name: "Validé" }, { name: "À revoir" }, { name: "Obsolète" },
    ] } },                                                  // humain
    Priorité: { select: { options: [
      { name: "P0" }, { name: "P1" }, { name: "P2" }, { name: "P3" },
    ] } },                                                  // humain
    "Automatisé": { checkbox: {} },                        // humain
    "Test lié": { rich_text: {} },                         // humain
    Owner: { people: {} },                                 // humain
  };
}

function machineProps(s: Scenario) {
  return {
    Nom: { title: [{ text: { content: s.nom.slice(0, 2000) } }] },
    Slug: { rich_text: [{ text: { content: s.slug } }] },
    Bloc: { select: { name: s.bloc || "Autre" } },
    Module: { select: { name: s.module } },
    Modules: { multi_select: s.modules.map((name) => ({ name })) },
    Nature: { select: { name: s.nature } },
    Tags: { multi_select: s.tags.map((name) => ({ name })) },
    Gherkin: { rich_text: [{ text: { content: s.gherkin.slice(0, 1900) } }] },
    "Fichier source": { rich_text: [{ text: { content: s.permalink } }] },
    "Présent dans le repo": { checkbox: true },
    "Dernier sync": { date: { start: new Date().toISOString() } },
  };
}

async function resolveParentPage(): Promise<string> {
  if (NOTION_PARENT_PAGE_ID) return NOTION_PARENT_PAGE_ID;
  if (!NOTION_SIBLING_DATABASE_ID) throw new Error("Ni NOTION_GHERKIN_PARENT_PAGE_ID ni NOTION_DATABASE_ID — impossible de cibler une page parente.");
  const sibling: any = await notion(`/databases/${NOTION_SIBLING_DATABASE_ID}`, "GET");
  const pageId = sibling.parent?.page_id;
  if (!pageId) throw new Error(`La DB ${NOTION_SIBLING_DATABASE_ID} n'a pas de page parente exploitable.`);
  return pageId;
}

async function ensureSchema(dbId: string): Promise<void> {
  const db: any = await notion(`/databases/${dbId}`, "GET");
  const props: Record<string, any> = db.properties ?? {};
  const titleEntry = Object.entries(props).find(([, p]: any) => p.type === "title");
  if (titleEntry && titleEntry[0] !== "Nom") {
    await notion(`/databases/${dbId}`, "PATCH", { properties: { [titleEntry[0]]: { name: "Nom" } } });
  }
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

async function ensureDatabase(): Promise<string> {
  if (NOTION_DATABASE_ID) { await ensureSchema(NOTION_DATABASE_ID); return NOTION_DATABASE_ID; }
  const parent = await resolveParentPage();
  const db = await notion("/databases", "POST", {
    parent: { type: "page_id", page_id: parent },
    title: [{ type: "text", text: { content: "Scénarios Gherkin — Parcours artisan" } }],
    properties: databaseSchema(),
  });
  console.log(`\n✅ DB Notion créée. Ajoute ceci à .env.notion :\n   NOTION_GHERKIN_DATABASE_ID=${db.id}\n`);
  return db.id;
}

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
  const files = walkFeatures(GHERKIN_DIR);
  const scenarios = files.flatMap(parseFeatureFile).sort((a, b) => a.slug.localeCompare(b.slug));

  const byBloc = new Map<string, number>();
  for (const s of scenarios) byBloc.set(s.bloc, (byBloc.get(s.bloc) ?? 0) + 1);
  console.log(`\n📦 ${scenarios.length} scénarios extraits de ${files.length} fichiers .feature.`);
  for (const [bloc, n] of [...byBloc].sort((a, b) => b[1] - a[1])) console.log(`     ${n.toString().padStart(3)}  ${bloc}`);

  if (!APPLY) {
    console.log("\n— DRY-RUN — (ajoute --apply pour écrire dans Notion) :");
    for (const s of scenarios) console.log(`   [${s.bloc}] ${s.slug}\n         modules: ${s.modules.join(", ")} | tags: ${s.tags.join(", ") || "—"} | ${s.nature}`);
    if (!NOTION_TOKEN) console.log("\n(ℹ️  NOTION_TOKEN absent : extraction validée sans appel réseau.)");
    return;
  }

  if (!NOTION_TOKEN) throw new Error("--apply nécessite NOTION_TOKEN.");
  const dbId = await ensureDatabase();
  NOTION_DATABASE_ID = dbId;

  console.log("\n🔄 Synchronisation Notion…");
  const existing = await fetchExisting(dbId);
  const currentSlugs = new Set(scenarios.map((s) => s.slug));
  let created = 0, updated = 0;

  await pMap(scenarios, async (s) => {
    const pageId = existing.get(s.slug);
    if (pageId) { await notionWithRetry(`/pages/${pageId}`, "PATCH", { properties: machineProps(s) }); updated++; }
    else { await notionWithRetry("/pages", "POST", { parent: { database_id: dbId }, properties: machineProps(s) }); created++; }
  }, 5);

  let orphans = 0;
  const orphanEntries = [...existing.entries()].filter(([slug]) => !currentSlugs.has(slug));
  await pMap(orphanEntries, async ([, pageId]) => {
    await notionWithRetry(`/pages/${pageId}`, "PATCH", {
      properties: { "Présent dans le repo": { checkbox: false }, "Dernier sync": { date: { start: new Date().toISOString() } } },
    });
    orphans++;
  }, 5);

  console.log(`\n✅ Terminé. Créés: ${created} · Mis à jour: ${updated} · Orphelins marqués: ${orphans}`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
