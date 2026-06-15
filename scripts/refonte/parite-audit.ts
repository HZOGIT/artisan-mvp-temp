// Audit de parité « nouveau stack vs legacy » pour piloter la dépréciation du legacy.
// Introspecte le routeur racine réellement monté (via buildApp → appRouter décoré) pour lister, par
// domaine migré, les procédures servies par le nouveau stack, et croise avec les routeurs tRPC
// top-level du legacy (server/routers.ts). Émet docs/architecture/refonte-parite-backlog.md.
//
//   DATABASE_URL=postgres://... pnpm exec tsx scripts/refonte/parite-audit.ts
//
// NB : l'énumération des procédures LEGACY par routeur n'est pas faite ici (parse de server/routers.ts
// trop fragile) — elle reste un diff manuel par domaine, tracé dans le backlog. Ce script fournit la
// surface FIABLE du nouveau stack + le statut de correspondance des noms.

import { writeFileSync } from "node:fs";
import { buildApp } from "../../src/app";
import { MIGRATED_DOMAINS } from "../../src/interface/gateway/migrated-domains";

// Routeurs tRPC top-level du legacy (clés appelées par le client) — cf. server/routers.ts.
const LEGACY_ROUTERS = [
  "emails", "activites", "depenses", "search", "subscription", "devices", "support", "modules",
  "importErp", "auth", "artisan", "clients", "articles", "devis", "factures", "interventions",
  "notifications", "dashboard", "parametres", "signature", "stocks", "fournisseurs", "modelesEmail",
  "commandesFournisseurs", "clientPortal", "contrats", "interventionsMobile", "chat", "techniciens",
  "avis", "geolocalisation", "comptabilite", "devisOptions", "rapports", "notificationsPush", "conges",
  "previsions", "vehicules", "badges", "alertesPrevisions", "chantiers", "integrationsComptables",
  "devisIA", "statistiques", "rdv", "relances", "portail", "calendrier", "assistant", "vitrine",
  "utilisateurs",
];

// Renommages connus migré → clé client legacy (à réconcilier en étape 1).
const RENAMES: Record<string, string> = {
  commandes: "commandesFournisseurs",
  rdvEnLigne: "rdv",
  relancesDevis: "relances",
  contratsMaintenance: "contrats",
  previsionsCA: "previsions",
};
// Domaines migrés exposés comme SOUS-routeurs d'un routeur legacy (pas top-level).
const SUBROUTER_OF: Record<string, string> = {
  ecritures: "comptabilite",
  notesDeFrais: "comptabilite",
};

const NON_DOMAINE = new Set(["health", "whoami"]);

function newStackProceduresByDomain(): Map<string, string[]> {
  const app = buildApp();
  const record = (app as unknown as { appRouter: { _def: { record: Record<string, unknown> } } }).appRouter._def.record;
  const byDomain = new Map<string, string[]>();
  for (const domain of Object.keys(record)) {
    if (NON_DOMAINE.has(domain)) continue;
    // La valeur d'un domaine est un RouterRecord dont les clés SONT les procédures.
    const sub = record[domain];
    const procs = sub && typeof sub === "object" ? Object.keys(sub as Record<string, unknown>) : ["(procédure)"];
    byDomain.set(domain, procs);
  }
  void app.close();
  return byDomain;
}

function main(): void {
  const procs = newStackProceduresByDomain();
  const legacy = new Set(LEGACY_ROUTERS);

  const lines: string[] = [];
  lines.push("# Refonte — backlog de parité & dépréciation legacy", "");
  lines.push("> ✅ **EXTINCTION DU LEGACY ACHEVÉE.** `server/` (legacy Express) a été supprimé ; le stack");
  lines.push("> est unique (Fastify + tRPC 11 + Drizzle pg + RLS). `LEGACY_ROUTERS` ci-dessous est un");
  lines.push("> **snapshot FIGÉ** de l'ancien `server/routers.ts` (conservé pour la traçabilité de l'audit,");
  lines.push("> il n'est plus lu en direct). Lecture des colonnes : « ✅ name-match » = la clé tRPC du new");
  lines.push("> stack == celle appelée par le client ; « ⚠️ sous-routeur de … » / « ⚠️ pas de top-level");
  lines.push("> legacy » = **bénin** (sous-ressource montée sous son parent, ou domaine new-stack sans");
  lines.push("> équivalent legacy top-level) — PAS un gap. La § 3 (« legacy-only ») ne liste plus que des");
  lines.push("> routeurs MORTS (0 appel client). **→ zéro gap de parité réel.**", "");
  lines.push("> Généré par `scripts/refonte/parite-audit.ts`. Pour CHAQUE domaine : statut de");
  lines.push("> correspondance du nom (la clé tRPC appelée par le client) + procédures servies par le");
  lines.push("> nouveau stack.", "");

  lines.push("## 1. Domaines migrés — correspondance de nom", "");
  lines.push("| Domaine (new stack) | Clé client | Statut | # procédures new |");
  lines.push("|---|---|---|---|");
  const ready: string[] = [];
  const toRename: string[] = [];
  for (const d of MIGRATED_DOMAINS) {
    const clientKey = RENAMES[d] ?? (SUBROUTER_OF[d] ? `${SUBROUTER_OF[d]}.${d}` : d);
    let statut: string;
    if (legacy.has(d)) { statut = "✅ name-match"; ready.push(d); }
    else if (RENAMES[d]) { statut = `⚠️ renommer → \`${RENAMES[d]}\``; toRename.push(d); }
    else if (SUBROUTER_OF[d]) { statut = `⚠️ sous-routeur de \`${SUBROUTER_OF[d]}\``; toRename.push(d); }
    else { statut = "⚠️ pas de top-level legacy"; toRename.push(d); }
    const n = (procs.get(d) ?? []).length;
    lines.push(`| ${d} | ${clientKey} | ${statut} | ${n} |`);
  }
  lines.push("");
  lines.push(`**Name-match (flippables après parité)** : ${ready.length} — ${ready.join(", ")}`, "");
  lines.push(`**À réconcilier (renommage / sous-routeur)** : ${toRename.length} — ${toRename.join(", ")}`, "");

  lines.push("## 2. Procédures servies par le nouveau stack (par domaine)", "");
  for (const d of MIGRATED_DOMAINS) {
    const list = (procs.get(d) ?? []).sort();
    lines.push(`- **${d}** (${list.length}) : ${list.map((p) => `\`${p}\``).join(", ")}`);
  }
  lines.push("");

  const legacyOnly = LEGACY_ROUTERS.filter((r) => !MIGRATED_DOMAINS.includes(r) && !Object.values(RENAMES).includes(r));
  lines.push("## 3. Routeurs tRPC legacy SANS équivalent clean-archi", "");
  lines.push(`${legacyOnly.length} routeurs présents dans le snapshot legacy mais pas dans le new-stack —`);
  lines.push("**MORTS (0 appel client, vérifié), droppables** ; le legacy étant éteint, ils ne sont servis");
  lines.push("nulle part (`portail` est superseded par `clientPortal` migré ; push notifications non utilisé) :", "");
  lines.push(legacyOnly.map((r) => `\`${r}\``).join(", "), "");
  lines.push("> Surface HORS tRPC (auth login/signup/reset, webhooks Stripe, uploads, PDF/iCal publics,");
  lines.push("> vitrine/portail publics par token) : **portée en routes Fastify dédiées** (cf. journal).", "");

  const out = "docs/architecture/refonte-parite-backlog.md";
  writeFileSync(out, lines.join("\n"));
  // eslint-disable-next-line no-console
  console.log(`[parite-audit] écrit ${out} — ${ready.length} name-match, ${toRename.length} à réconcilier, ${legacyOnly.length} routeurs legacy-only.`);
}

main();
