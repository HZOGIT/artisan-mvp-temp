import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

// Garde-fou de couverture (chantier T2 du spike OPE-316) : TOUT routeur tRPC `*.router.ts` du
// new-stack DOIT avoir un test e2e sibling `*.router.test.ts` (niveau L3 de la « colonne de tests »).
// Atteint le 2026-06-16 (boucle OPE-318) : 0 routeur sans test. Ce test devient ROUGE si un routeur
// est ajouté sans son L3 (ou si un test L3 est supprimé) → empêche la régression silencieuse.
const MODULES_ROOT = path.resolve(import.meta.dirname, "../../modules");

function findRouterFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouterFiles(full));
    else if (entry.name.endsWith(".router.ts")) out.push(full);
  }
  return out;
}

describe("couverture L3 des routeurs tRPC (garde-fou anti-régression)", () => {
  const routers = findRouterFiles(MODULES_ROOT);

  it("au moins un routeur détecté (sanity du scan)", () => {
    expect(routers.length).toBeGreaterThan(20);
  });

  it("chaque *.router.ts a un *.router.test.ts sibling", () => {
    const sansTest = routers.filter((f) => !existsSync(f.replace(/\.ts$/, ".test.ts")));
    expect(sansTest, `Routeurs sans test L3 (ajouter <nom>.router.test.ts) :\n${sansTest.join("\n")}`).toEqual([]);
  });
});
