import { describe, expect, it } from "vitest";
import * as ui from "./index";

// Garde-fou de la surface des primitives UI du front neuf : vérifie que la copie conforme expose bien
// tous les composants dont la Vague 1 (`pages/Clients.tsx`) a besoin. Empêche qu'un ré-export saute
// silencieusement (renommage/suppression côté legacy) avant qu'une page migrée ne casse.
describe("modern/shared/ui — surface copie conforme (Vague 1)", () => {
  const requis = [
    "Button",
    "Input",
    "Card",
    "CardContent",
    "Label",
    "DropdownMenu",
    "DropdownMenuTrigger",
    "DropdownMenuContent",
    "DropdownMenuItem",
  ] as const;

  it("expose toutes les primitives requises", () => {
    for (const nom of requis) {
      expect(ui[nom as keyof typeof ui], nom).toBeDefined();
    }
  });
});
