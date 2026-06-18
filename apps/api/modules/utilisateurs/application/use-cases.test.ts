import { describe, it, expect } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors";
import { FakeEmailPort } from "../../../shared/ports/fakes";
import { FakePasswordHasher } from "../../../shared/ports/password-hasher-bcrypt";
import type { TenantContext } from "../../../shared/tenant";
import { FakeUtilisateurRepository } from "../infra/utilisateur-repository-fake";
import type { UtilisateurDeps } from "./use-cases";
import {
  basculerActif,
  changerRole,
  definirPermissions,
  inviterUtilisateur,
  lirePermissions,
  listUtilisateurs,
  reinitialiserPermissions,
} from "./use-cases";

const ctx = (artisanId: number): TenantContext => ({ artisanId, userId: 1 });
const A = 10;
const B = 20;

function makeDeps(over: Partial<UtilisateurDeps> = {}): { deps: UtilisateurDeps; repo: FakeUtilisateurRepository; email: FakeEmailPort } {
  const repo = new FakeUtilisateurRepository();
  const email = new FakeEmailPort();
  const deps: UtilisateurDeps = { repo, hasher: new FakePasswordHasher(), email, genTempPassword: () => "TEMP123456", ...over };
  return { deps, repo, email };
}

describe("utilisateurs use-cases", () => {
  it("list : owner ∪ collaborateurs du tenant", async () => {
    const { deps, repo } = makeDeps();
    repo.setOwner(A, 100);
    repo.seedUser({ id: 100, role: "artisan", artisanId: null }); // owner (rattaché via artisans.userId)
    repo.seedUser({ id: 101, role: "secretaire", artisanId: A });
    repo.seedUser({ id: 200, role: "technicien", artisanId: B }); // autre tenant
    const list = await listUtilisateurs(deps, ctx(A));
    expect(list.map((u) => u.id).sort()).toEqual([100, 101]);
  });

  it("invite : email unique → hash MDP temp + création + seed perms du rôle + email envoyé", async () => {
    const { deps, repo, email } = makeDeps();
    repo.setNomEntreprise(A, "Plomberie Dupont");
    const res = await inviterUtilisateur(deps, ctx(A), { email: "new@t.fr", nom: "Martin", role: "secretaire" });
    expect(res.email).toBe("new@t.fr");
    expect(res.role).toBe("secretaire");
    // Permissions du rôle secretaire seedées.
    const perms = await repo.getPermissions(res.id);
    expect(perms).toContain("devis.voir");
    expect(perms).not.toContain("utilisateurs.gerer");
    // Email d'invitation envoyé avec le MDP temp + raison sociale échappée.
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe("new@t.fr");
    expect(email.sent[0].body).toContain("TEMP123456");
    expect(email.sent[0].body).toContain("Plomberie Dupont");
  });

  it("invite : email déjà utilisé → ConflictError (aucun email envoyé)", async () => {
    const { deps, repo, email } = makeDeps();
    repo.seedUser({ id: 5, role: "secretaire", email: "dup@t.fr", artisanId: A });
    await expect(inviterUtilisateur(deps, ctx(A), { email: "dup@t.fr", nom: "X", role: "technicien" })).rejects.toBeInstanceOf(ConflictError);
    expect(email.sent).toHaveLength(0);
  });

  it("updateRole/toggleActif : collaborateur du tenant OK ; autre tenant → NotFoundError", async () => {
    const { deps, repo } = makeDeps();
    repo.seedUser({ id: 101, role: "technicien", artisanId: A });
    repo.seedUser({ id: 200, role: "technicien", artisanId: B });
    expect(await changerRole(deps, ctx(A), 101, "secretaire")).toEqual({ id: 101, role: "secretaire" });
    expect(await basculerActif(deps, ctx(A), 101, false)).toEqual({ id: 101, actif: false });
    // Anti-IDOR : A ne peut pas toucher un user de B.
    await expect(changerRole(deps, ctx(A), 200, "secretaire")).rejects.toBeInstanceOf(NotFoundError);
    await expect(basculerActif(deps, ctx(A), 200, false)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("PROTECTION OWNER : aucune mutation ne peut cibler le propriétaire (anti-lockout) → ForbiddenError", async () => {
    const { deps, repo } = makeDeps();
    repo.setOwner(A, 100); // user 100 = propriétaire de l'entreprise A
    repo.seedUser({ id: 100, role: "artisan", artisanId: A }); // owner ciblable (users.artisanId = A, cf. provisioning)
    await expect(changerRole(deps, ctx(A), 100, "technicien")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(basculerActif(deps, ctx(A), 100, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(definirPermissions(deps, ctx(A), 100, ["clients.voir"])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reinitialiserPermissions(deps, ctx(A), 100)).rejects.toBeInstanceOf(ForbiddenError);
    // L'owner n'a PAS été modifié (toujours artisan + actif).
    const list = await listUtilisateurs(deps, ctx(A));
    expect(list.find((u) => u.id === 100)).toMatchObject({ role: "artisan", actif: true });
  });

  it("changerRole : réinitialise les permissions aux défauts du nouveau rôle", async () => {
    const { deps, repo } = makeDeps();
    repo.seedUser({ id: 101, role: "technicien", artisanId: A });
    repo.seedPermissions(101, ["devis.voir"]);
    await changerRole(deps, ctx(A), 101, "technicien");
    const perms = await repo.getPermissions(101);
    expect(perms).toContain("interventions.voir");
    expect(perms).not.toContain("devis.voir");
  });

  it("getPermissions : inclut l'owner ; renvoie permissions + roleDefaults", async () => {
    const { deps, repo } = makeDeps();
    repo.setOwner(A, 100);
    repo.seedUser({ id: 100, role: "artisan", artisanId: null });
    repo.seedPermissions(100, ["devis.voir", "factures.voir"]);
    const info = await lirePermissions(deps, ctx(A), 100);
    expect(info.permissions).toEqual(["devis.voir", "factures.voir"]);
    expect(info.roleDefaults).toContain("devis.creer");
    // user d'un autre tenant → NotFound.
    repo.seedUser({ id: 200, role: "technicien", artisanId: B });
    await expect(lirePermissions(deps, ctx(A), 200)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updatePermissions : filtre les codes hors-catalogue ; non possédé → NotFoundError", async () => {
    const { deps, repo } = makeDeps();
    repo.seedUser({ id: 101, role: "secretaire", artisanId: A });
    const res = await definirPermissions(deps, ctx(A), 101, ["devis.voir", "INVALIDE", "factures.voir"]);
    expect(res).toEqual({ success: true, count: 2 });
    expect(await repo.getPermissions(101)).toEqual(["devis.voir", "factures.voir"]);
    repo.seedUser({ id: 200, role: "technicien", artisanId: B });
    await expect(definirPermissions(deps, ctx(A), 200, ["devis.voir"])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resetPermissions : réapplique les défauts du rôle", async () => {
    const { deps, repo } = makeDeps();
    repo.seedUser({ id: 101, role: "technicien", artisanId: A });
    repo.seedPermissions(101, ["devis.voir"]);
    const res = await reinitialiserPermissions(deps, ctx(A), 101);
    expect(res.permissions).toContain("interventions.voir");
    expect(await repo.getPermissions(101)).toContain("calendrier.voir");
  });
});
