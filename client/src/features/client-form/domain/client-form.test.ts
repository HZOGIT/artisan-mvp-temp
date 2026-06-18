import { describe, expect, it } from "vitest";
import { defaultClientForm, validateClientForm, buildCreatePayload } from "./client-form";

describe("client-form — domain pur", () => {
  it("defaultClientForm : particulier, champs vides", () => {
    const f = defaultClientForm();
    expect(f.type).toBe("particulier");
    expect(f.nom).toBe("");
  });

  it("validateClientForm : nom requis (trim)", () => {
    expect(validateClientForm(defaultClientForm())).toBe("errNom");
    expect(validateClientForm({ ...defaultClientForm(), nom: "   " })).toBe("errNom");
    expect(validateClientForm({ ...defaultClientForm(), nom: "Dupont" })).toBeNull();
  });

  it("buildCreatePayload : passe le formulaire (champs vides nullish acceptés)", () => {
    const f = { ...defaultClientForm(), nom: "Dupont", type: "professionnel" as const, siret: "123" };
    const p = buildCreatePayload(f);
    expect(p.nom).toBe("Dupont");
    expect(p.type).toBe("professionnel");
    expect(p.siret).toBe("123");
  });
});
