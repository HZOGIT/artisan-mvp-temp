// scripts/test-modules-pg.mjs — OPE-184 P0.7d-6 — modules + artisan_modules sur PG.
// getModules (catalogue, ModuleRow.actif_par_defaut en number 1/0), getModuleBySlug,
// getArtisanModulesActifs (fallback défauts si vide / sinon actifs), setArtisanModule (upsert).
import {
  getModules, getModuleBySlug, getArtisanModulesActifs, setArtisanModule,
  invalidateCache, getDb,
} from "../server/db.ts";
import { modules, artisanModules } from "../drizzle/schema.active.ts";
import { eq } from "drizzle-orm";

const A = 99121;
let ok = true;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); if (!cond) ok = false; };
const inval = () => { invalidateCache(`modules:actifs:${A}`); invalidateCache("modules:all"); };

try {
  const db = await getDb();
  await db.delete(artisanModules).where(eq(artisanModules.artisan_id, A));

  // catalogue (seedé par fix-duplicates : ~18 modules)
  const all = await getModules();
  check(`getModules : catalogue non vide → ${all.length}`, all.length > 0);
  check(`ModuleRow.actif_par_defaut est un number (0/1, pas boolean) → ${typeof all[0].actif_par_defaut}`,
    typeof all[0].actif_par_defaut === "number" && (all[0].actif_par_defaut === 0 || all[0].actif_par_defaut === 1));
  check(`getModules trié par ordre ASC`, all.every((m, i) => i === 0 || m.ordre >= all[i - 1].ordre));

  const slug0 = all[0].slug;
  const bySlug = await getModuleBySlug(slug0);
  check(`getModuleBySlug(${slug0}) trouvé → ${bySlug?.slug}`, bySlug?.slug === slug0);
  check(`getModuleBySlug actif_par_defaut number → ${typeof bySlug?.actif_par_defaut}`, typeof bySlug?.actif_par_defaut === "number");
  const bySlugAbsent = await getModuleBySlug("__inexistant__");
  check(`getModuleBySlug inexistant → undefined`, bySlugAbsent === undefined);

  // artisan sans préférence → fallback sur les modules actif_par_defaut
  inval();
  const defauts = await getArtisanModulesActifs(A);
  const defautsAttendus = all.filter((m) => m.actif_par_defaut === 1).map((m) => m.slug).sort();
  check(`fallback défauts : ${defauts.length} slugs = ${defautsAttendus.length} attendus`,
    defauts.slice().sort().join(",") === defautsAttendus.join(","));

  // active explicitement un module non-défaut + désactive un défaut
  const unDefaut = all.find((m) => m.actif_par_defaut === 1);
  const unNonDefaut = all.find((m) => m.actif_par_defaut === 0);
  await setArtisanModule(A, unNonDefaut.slug, true);
  await setArtisanModule(A, unDefaut.slug, false);
  inval();
  let actifs = await getArtisanModulesActifs(A);
  check(`setArtisanModule : non-défaut ${unNonDefaut.slug} activé → présent`, actifs.includes(unNonDefaut.slug));
  check(`setArtisanModule : défaut ${unDefaut.slug} désactivé → absent`, !actifs.includes(unDefaut.slug));

  // upsert idempotent : re-toggle même module, pas de doublon de ligne
  await setArtisanModule(A, unNonDefaut.slug, true);
  const rows = await db.select().from(artisanModules).where(eq(artisanModules.artisan_id, A));
  const dups = rows.filter((r) => r.module_slug === unNonDefaut.slug);
  check(`upsert idempotent : 1 seule ligne pour ${unNonDefaut.slug} → ${dups.length}`, dups.length === 1);

  // re-désactive → sort de la liste
  await setArtisanModule(A, unNonDefaut.slug, false);
  inval();
  actifs = await getArtisanModulesActifs(A);
  check(`désactivation : ${unNonDefaut.slug} retiré → absent`, !actifs.includes(unNonDefaut.slug));

  // cleanup
  await db.delete(artisanModules).where(eq(artisanModules.artisan_id, A));
} catch (e) {
  console.error("❌ EXCEPTION", e);
  ok = false;
}

console.log(ok ? "\n=== ✅ MODULES PG OK ===" : "\n=== ❌ MODULES PG FAIL ===");
process.exit(ok ? 0 : 1);
