import { describe, it, expect } from "vitest";
import { UnauthorizedError } from "../../../shared/errors";
import { FakePasswordHasher } from "../../../shared/ports/password-hasher-bcrypt";
import { verifyAuthToken } from "../../../shared/tenant/jwt";
import { FakeAuthRepository } from "../infra/auth-repository-fake";
import type { AuthDeps } from "./use-cases";
import { me, signin } from "./use-cases";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";
const makeDeps = (repo: FakeAuthRepository): AuthDeps => ({ repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET });

describe("auth use-cases", () => {
  it("me : null sans claims ; renvoie l'utilisateur + permissions sinon", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 5, email: "u@t.fr", name: "Jean", role: "artisan", artisanId: 3 });
    expect(await me(repo, null, [])).toBeNull();
    expect(await me(repo, { userId: 5, email: "u@t.fr" }, ["devis.voir"])).toMatchObject({ id: 5, email: "u@t.fr", role: "artisan", permissions: ["devis.voir"] });
  });

  it("me : utilisateur désactivé → null (parité legacy bloque les inactifs)", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 5, email: "u@t.fr", actif: false });
    expect(await me(repo, { userId: 5, email: "u@t.fr" }, [])).toBeNull();
  });

  it("signin : identifiants valides → user + JWT vérifiable (claims) + lastSignedIn touché", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 7, email: "ok@t.fr", password: "hashed:secret", role: "artisan" });
    const { user, token } = await signin(makeDeps(repo), { email: "ok@t.fr", password: "secret" });
    expect(user.id).toBe(7);
    expect((user as Record<string, unknown>).password).toBeUndefined(); // jamais le hash
    expect(await verifyAuthToken(token, SECRET)).toEqual({ userId: 7, email: "ok@t.fr" });
    expect(repo.touched).toEqual([7]);
  });

  it("signin : email inconnu / mauvais mot de passe / sans hash → UnauthorizedError", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 7, email: "ok@t.fr", password: "hashed:secret" });
    repo.seed({ id: 8, email: "oauth@t.fr", password: null }); // compte OAuth (pas de mot de passe)
    const deps = makeDeps(repo);
    await expect(signin(deps, { email: "inconnu@t.fr", password: "x" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(signin(deps, { email: "ok@t.fr", password: "mauvais" })).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(signin(deps, { email: "oauth@t.fr", password: "x" })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(repo.touched).toEqual([]); // aucun login réussi
  });
});
