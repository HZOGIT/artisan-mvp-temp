import { describe, it, expect } from "vitest";
import {
  ASSISTANT_TOOLS,
  TOOL_INVALIDATIONS,
  WRITE_TOOL_NAMES,
  isWriteTool,
  findTool,
  type ToolParamSchema,
} from "./assistant-tools-catalog";

// Parité de surface avec le legacy `server/_core/assistantTools.ts` : tout drift de ce catalogue
// change le comportement du modèle (function-calling) → on verrouille l'ensemble des 23 noms, la
// partition lecture/écriture et la cohérence structurelle des schémas.

// Les 23 noms d'outils, dans l'ordre du legacy (`AGENT_TOOLS`).
const EXPECTED_TOOL_NAMES = [
  "chercher_client",
  "creer_devis",
  "envoyer_devis",
  "creer_et_envoyer_devis",
  "creer_facture",
  "envoyer_facture",
  "envoyer_relance",
  "creer_intervention",
  "lister_factures_impayees",
  "lister_devis_en_attente",
  "lister_factures",
  "lister_devis",
  "verifier_stocks",
  "creer_commande_fournisseur",
  "envoyer_commande_fournisseur",
  "lister_clients",
  "creer_client",
  "get_statistiques",
  "lister_fournisseurs",
  "chercher_fournisseur",
  "lister_interventions",
  "modifier_intervention",
  "naviguer_vers",
];

// Les 11 outils d'écriture = clés de `TOOL_INVALIDATIONS` (legacy).
const EXPECTED_WRITE_TOOLS = [
  "creer_client",
  "creer_devis",
  "envoyer_devis",
  "creer_et_envoyer_devis",
  "creer_facture",
  "envoyer_facture",
  "envoyer_relance",
  "creer_intervention",
  "modifier_intervention",
  "creer_commande_fournisseur",
  "envoyer_commande_fournisseur",
];

// Validation structurelle récursive : chaque `required` ⊆ `properties`, `array` a des `items`.
function assertSchemaCoherent(schema: ToolParamSchema, path: string): void {
  if (schema.type === "object") {
    const props = schema.properties ?? {};
    for (const req of schema.required ?? []) {
      expect(Object.keys(props), `${path}: required "${req}" doit être une propriété`).toContain(req);
    }
    for (const [key, child] of Object.entries(props)) assertSchemaCoherent(child, `${path}.${key}`);
  }
  if (schema.type === "array") {
    expect(schema.items, `${path}: array doit déclarer items`).toBeDefined();
    if (schema.items) assertSchemaCoherent(schema.items, `${path}[]`);
  }
}

describe("assistant-tools-catalog", () => {
  it("expose exactement les 23 outils du legacy, dans l'ordre", () => {
    expect(ASSISTANT_TOOLS.map((t) => t.name)).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("noms uniques + descriptions non vides + racine objet", () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool.description.length, `${tool.name}: description`).toBeGreaterThan(0);
      expect(tool.parameters.type, `${tool.name}: racine objet`).toBe("object");
      assertSchemaCoherent(tool.parameters, tool.name);
    }
  });

  it("partition lecture/écriture : WRITE_TOOL_NAMES == clés TOOL_INVALIDATIONS (11 écritures)", () => {
    expect([...WRITE_TOOL_NAMES].sort()).toEqual([...EXPECTED_WRITE_TOOLS].sort());
    expect([...WRITE_TOOL_NAMES].sort()).toEqual(Object.keys(TOOL_INVALIDATIONS).sort());
    expect(WRITE_TOOL_NAMES.size).toBe(11);
    // Les 12 autres outils (23-11) sont des lectures/navigation → non-écritures.
    const reads = ASSISTANT_TOOLS.filter((t) => !isWriteTool(t.name));
    expect(reads).toHaveLength(12);
  });

  it("toute écriture déclarée correspond à un outil existant, et invalide ≥1 cache", () => {
    for (const [name, keys] of Object.entries(TOOL_INVALIDATIONS)) {
      expect(findTool(name), `${name} doit exister`).not.toBeNull();
      expect(keys.length, `${name} doit invalider ≥1 cache`).toBeGreaterThan(0);
    }
  });

  it("findTool : connu → schéma ; inconnu → null", () => {
    expect(findTool("creer_devis")?.name).toBe("creer_devis");
    expect(findTool("inexistant")).toBeNull();
  });
});
