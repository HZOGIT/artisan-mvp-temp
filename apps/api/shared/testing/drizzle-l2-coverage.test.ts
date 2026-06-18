import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

// Garde-fou de couverture L2 (boucle OPE-318, jalon it.74 « front L2 drizzle épuisé »). TOUT adaptateur
// Drizzle `*-drizzle.ts` du new-stack DOIT avoir un test : soit un sibling `*-drizzle.test.ts`, soit
// figurer dans l'ALLOW-LIST des adaptateurs couverts par un test COMBINÉ (plusieurs adaptateurs d'une
// même feature testés dans un seul fichier). Ce test devient ROUGE si un adaptateur Drizzle est ajouté
// sans test → empêche la régression silencieuse de couverture (analogue à `router-coverage.test.ts` pour L3).
const MODULES_ROOT = path.resolve(import.meta.dirname, "../../modules");

// Adaptateurs SANS sibling mais couverts par un test combiné (chemin relatif à src/modules) → fichier de test.
const COMBINED_COVERAGE: Record<string, string> = {
  "avis/infra/public-demande-context-reader-drizzle.ts": "avis/infra/public-avis-flow-drizzle.test.ts",
  "avis/infra/public-avis-writer-drizzle.ts": "avis/infra/public-avis-flow-drizzle.test.ts",
  "assistant/infra/assistant-thread-writer-drizzle.ts": "assistant/infra/assistant-threads-drizzle.test.ts",
  "factures/infra/client-reader-drizzle.ts": "factures/infra/contact-readers-drizzle.test.ts",
  "factures/infra/devis-reader-drizzle.ts": "factures/infra/contact-readers-drizzle.test.ts",
  "factures/infra/artisan-reader-drizzle.ts": "factures/infra/contact-readers-drizzle.test.ts",
};

function findDrizzleAdapters(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findDrizzleAdapters(full));
    else if (entry.name.endsWith("-drizzle.ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("couverture L2 des adaptateurs Drizzle (garde-fou anti-régression)", () => {
  const adapters = findDrizzleAdapters(MODULES_ROOT);

  it("au moins quelques adaptateurs détectés (sanity du scan)", () => {
    expect(adapters.length).toBeGreaterThan(20);
  });

  it("chaque *-drizzle.ts a un test sibling OU une entrée d'allow-list combinée", () => {
    const sansTest = adapters.filter((f) => {
      if (existsSync(f.replace(/\.ts$/, ".test.ts"))) return false; // sibling
      const rel = path.relative(MODULES_ROOT, f).split(path.sep).join("/");
      const combined = COMBINED_COVERAGE[rel];
      return !(combined && existsSync(path.join(MODULES_ROOT, combined))); // test combiné valide
    });
    expect(
      sansTest,
      `Adaptateurs Drizzle sans test L2 (ajouter <nom>-drizzle.test.ts, ou une entrée COMBINED_COVERAGE si testé dans un fichier combiné) :\n${sansTest.join("\n")}`,
    ).toEqual([]);
  });

  it("l'allow-list combinée ne référence que des adaptateurs et tests existants (pas de stale)", () => {
    const stale: string[] = [];
    for (const [adapter, test] of Object.entries(COMBINED_COVERAGE)) {
      if (!existsSync(path.join(MODULES_ROOT, adapter))) stale.push(`adapter absent: ${adapter}`);
      if (!existsSync(path.join(MODULES_ROOT, test))) stale.push(`test absent: ${test}`);
    }
    expect(stale, `Entrées COMBINED_COVERAGE périmées :\n${stale.join("\n")}`).toEqual([]);
  });
});
