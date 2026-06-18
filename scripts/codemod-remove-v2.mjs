#!/usr/bin/env node
// Codemod OPE-403 — retrait du préfixe /v2 (le legacy est mort → /v2 inutile).
// Remplace le sous-chemin de PATH `/v2/` → `/` dans les littéraux de chaîne du code, en EXCLUANT :
//  - les fichiers binaires/base64 (fonts.ts) où "/v2" apparaît par hasard ;
//  - les fichiers STRUCTURELS du routage (basepath, resolveV2Path/Url, useV2Bascule, entry-routes, App.tsx)
//    qui sont traités À LA MAIN (sinon redirections identité → boucles).
// Mode DRY-RUN par défaut : n'écrit rien, affiche les changements. `--apply` pour écrire.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "client/src";
const APPLY = process.argv.includes("--apply");

// Fichiers traités À LA MAIN (exclus du codemod) — chemins relatifs à la racine repo.
const HAND_FILES = new Set([
  "client/src/modern/shared/flag/v2-routes.ts",
  "client/src/modern/shared/flag/v2-routes.test.ts",
  "client/src/modern/shared/flag/use-v2-bascule.ts",
  "client/src/modern/shared/router/entry-routes.ts",
  "client/src/modern/shared/router/entry-routes.test.ts",
  "client/src/App.tsx",
  "client/src/modern/shared/lib/fonts.ts", // base64 — "/v2" fortuit
]);

// Le PATH `/v2/` apparaît toujours collé à un guillemet/backtick/slash dans un littéral. On remplace la
// sous-chaîne `/v2/` → `/` UNIQUEMENT quand elle est précédée d'un délimiteur de chaîne ou d'un caractère
// d'URL sûr (`"` `'` `` ` `` `(` `=` espace) pour éviter tout faux positif type `/api/v2/`.
// Pattern : (délimiteur)/v2/  → (délimiteur)/
const RE = /(["'`(=\s])\/v2\//g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    // Exclut les tests : ils vérifient la couche resolve/nav qui est retravaillée À LA MAIN.
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

let totalFiles = 0, totalRepl = 0;
const report = [];
for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, "/");
  if (HAND_FILES.has(rel)) continue;
  const src = readFileSync(file, "utf8");
  let count = 0;
  const next = src.replace(RE, (_m, d) => { count++; return `${d}/`; });
  if (count > 0) {
    totalFiles++; totalRepl += count;
    report.push({ rel, count, samples: [...src.matchAll(RE)].slice(0, 2).map((m) => m[0]) });
    if (APPLY) writeFileSync(file, next);
  }
}

console.log(`\n=== Codemod retrait /v2 — ${APPLY ? "APPLIQUÉ" : "DRY-RUN"} ===`);
for (const r of report) console.log(`  ${r.rel}  (${r.count})  ex: ${r.samples.join(" , ")}`);
console.log(`\nTOTAL : ${totalRepl} remplacements dans ${totalFiles} fichiers (hors ${HAND_FILES.size} fichiers à-la-main).`);
console.log(`Fichiers À LA MAIN après codemod : v2-routes (resolveV2Path/Url/V2_ROUTES/isV2Path → supprimer), use-v2-bascule (supprimer), entry-routes (retirer redirections+/v2), App.tsx, router basepath ×2.`);
if (!APPLY) console.log(`\n(dry-run — relancer avec --apply pour écrire)`);
