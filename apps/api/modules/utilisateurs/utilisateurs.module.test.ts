import { describe, it, expect } from "vitest";
import { createUtilisateursModule, defaultTempPassword } from "./utilisateurs.module";
import { FakeUtilisateurRepository } from "./infra/utilisateur-repository-fake";
import { FakeEmailPort } from "../../shared/ports/fakes";
import { FakePasswordHasher } from "../../shared/ports/password-hasher-bcrypt";

const make = () =>
  createUtilisateursModule({ repository: new FakeUtilisateurRepository(), hasher: new FakePasswordHasher(), email: new FakeEmailPort() });

describe("utilisateurs.module", () => {
  it("expose les 7 procédures tRPC", () => {
    const procedures = Object.keys((make().router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getPermissions", "invite", "list", "resetPermissions", "toggleActif", "updatePermissions", "updateRole"]);
  });

  it("defaultTempPassword : 10 caractères alphanumériques, non répété", () => {
    const a = defaultTempPassword();
    expect(a).toMatch(/^[a-z0-9]{10}$/);
    expect(a).not.toBe(defaultTempPassword());
  });
});
