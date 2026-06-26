import { describe, it, expect } from "vitest";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "../../../shared/errors";
import { FakeEmailPort } from "../../../shared/ports/fakes";
import { FakePasswordHasher } from "../../../shared/ports/password-hasher-bcrypt";
import { verifyAuthToken } from "../../../shared/tenant/jwt";
import { FakeAuthRepository } from "../infra/auth-repository-fake";
import type { AuthDeps } from "./use-cases";
import { deleteAccount, forgotPassword, logoutEverywhere, me, resetPassword, signin, signup, updateEmail, updatePassword } from "./use-cases";

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
    expect(await verifyAuthToken(token, SECRET)).toMatchObject({ userId: 7, email: "ok@t.fr" });
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

  it("signin : compte désactivé (actif===false) → ForbiddenError (message explicite)", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 9, email: "disabled@t.fr", password: "hashed:secret", actif: false });
    const deps = makeDeps(repo);
    const error = await signin(deps, { email: "disabled@t.fr", password: "secret" }).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe("Votre compte a été désactivé. Contactez le support.");
    expect(repo.touched).toEqual([]); // pas de lastSignedIn touché
  });

  it("signup : email libre → crée user + bootstrap + JWT + email bienvenue ; email pris → ConflictError", async () => {
    const repo = new FakeAuthRepository();
    const email = new FakeEmailPort();
    const deps: AuthDeps = { repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET, email, appUrl: "https://app.test" };
    const { user, token } = await signup(deps, { email: "new@t.fr", password: "secret6", name: "Léa" });
    expect(user.email).toBe("new@t.fr");
    expect(await verifyAuthToken(token, SECRET)).toMatchObject({ email: "new@t.fr" });
    expect(repo.bootstrapped).toEqual([user.id]); // provisionnement appelé
    expect(email.sent[0].subject).toContain("Bienvenue");
    // Le mot de passe est haché (jamais en clair).
    expect((await repo.findCredentials("new@t.fr"))?.password).toBe("hashed:secret6");
    // Email déjà pris → 409, pas de 2e bootstrap.
    await expect(signup(deps, { email: "new@t.fr", password: "secret6" })).rejects.toBeInstanceOf(ConflictError);
    expect(repo.bootstrapped).toEqual([user.id]);
  });

  it("updateEmail : bon mot de passe → OK ; email pris par un autre → ConflictError", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "moi@t.fr", password: "hashed:secret" });
    repo.seed({ id: 2, email: "autre@t.fr", password: "hashed:x" });
    const deps = makeDeps(repo);
    expect(await updateEmail(deps, 1, "nouveau@t.fr", "secret")).toEqual({ success: true });
    expect((await repo.getById(1))?.email).toBe("nouveau@t.fr");
    await expect(updateEmail(deps, 1, "autre@t.fr", "secret")).rejects.toBeInstanceOf(ConflictError);
    expect(await updateEmail(deps, 1, "nouveau@t.fr", "secret")).toEqual({ success: true });
  });

  it("updateEmail : mauvais mot de passe → UnauthorizedError", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "moi@t.fr", password: "hashed:secret" });
    await expect(updateEmail(makeDeps(repo), 1, "nouveau@t.fr", "mauvais")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("updateEmail : compte sans mot de passe (OAuth) → ValidationError", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "oauth@t.fr", password: null });
    await expect(updateEmail(makeDeps(repo), 1, "nouveau@t.fr", "x")).rejects.toBeInstanceOf(ValidationError);
  });

  it("updatePassword : vérifie l'ancien (bcrypt) puis hashe le nouveau ; mauvais ancien → 401", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr", password: "hashed:vieux" });
    const deps = makeDeps(repo);
    await expect(updatePassword(deps, 1, "faux", "nouveaupass")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await updatePassword(deps, 1, "vieux", "nouveaupass")).toEqual({ success: true });
    expect((await repo.findCredentialsById(1))?.password).toBe("hashed:nouveaupass");
  });

  it("updatePassword : compte sans mot de passe (OAuth) → ValidationError (400)", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "oauth@t.fr", password: null });
    await expect(updatePassword(makeDeps(repo), 1, "x", "nouveaupass")).rejects.toBeInstanceOf(ValidationError);
  });

  it("forgotPassword : anti-énumération (toujours success), pose le jeton + envoie l'email pour un compte valide", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "valide@t.fr", password: "hashed:x", actif: true });
    const email = new FakeEmailPort();
    const deps: AuthDeps = { repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET, email, appUrl: "https://app.test", genResetToken: () => "RAWTOKEN" };
    // Compte valide → email envoyé, jeton posé (hash, jamais le brut en base).
    expect(await forgotPassword(deps, "valide@t.fr")).toEqual({ success: true });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].body).toContain("https://app.test/reset-password?token=RAWTOKEN");
    // Email inconnu → MÊME réponse, aucun email (anti-énumération).
    expect(await forgotPassword(deps, "inconnu@t.fr")).toEqual({ success: true });
    expect(email.sent).toHaveLength(1);
  });

  it("resetPassword : jeton valide → applique + invalide ; jeton inconnu/expiré → ValidationError", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr", password: "hashed:vieux", actif: true });
    const deps: AuthDeps = { repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET, email: new FakeEmailPort(), appUrl: "https://app.test", genResetToken: () => "RAWTOKEN" };
    await forgotPassword(deps, "u@t.fr"); // pose le jeton (hash de RAWTOKEN)
    await expect(resetPassword(deps, "mauvais-token", "nouveaupass")).rejects.toBeInstanceOf(ValidationError);
    expect(await resetPassword(deps, "RAWTOKEN", "nouveaupass")).toEqual({ success: true });
    expect((await repo.findCredentialsById(1))?.password).toBe("hashed:nouveaupass");
    // Jeton consommé : un 2e usage échoue.
    await expect(resetPassword(deps, "RAWTOKEN", "encore")).rejects.toBeInstanceOf(ValidationError);
  });

  it("deleteAccount : soft-delete + purgePersonalData appelé ; confirmation incorrecte → 400", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr" });
    const deps = makeDeps(repo);
    await expect(deleteAccount(deps, 1, "oui")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.purged).toHaveLength(0);
    expect(await deleteAccount(deps, 1, "SUPPRIMER")).toEqual({ success: true });
    const u = await repo.getById(1);
    expect(u?.actif).toBe(false);
    expect(u?.email).toMatch(/^deleted_1_\d+@operioz\.com$/);
    expect(repo.purged).toContain(1);
  });

  it("updatePassword : bumpe passwordChangedAt (révocation des anciens tokens)", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr", password: "hashed:vieux" });
    expect(await repo.getPasswordChangedAt(1)).toBeNull();
    await updatePassword(makeDeps(repo), 1, "vieux", "nouveaupass");
    expect(await repo.getPasswordChangedAt(1)).toBeInstanceOf(Date);
  });

  it("resetPassword : bumpe passwordChangedAt (révocation des anciens tokens)", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr", password: "hashed:vieux", actif: true });
    const deps: AuthDeps = { repo, hasher: new FakePasswordHasher(), jwtSecret: SECRET, email: new FakeEmailPort(), appUrl: "https://app.test", genResetToken: () => "RAWTOKEN" };
    await forgotPassword(deps, "u@t.fr");
    expect(await repo.getPasswordChangedAt(1)).toBeNull();
    await resetPassword(deps, "RAWTOKEN", "nouveaupass");
    expect(await repo.getPasswordChangedAt(1)).toBeInstanceOf(Date);
  });

  it("logoutEverywhere : bumpe passwordChangedAt sans changer le mot de passe", async () => {
    const repo = new FakeAuthRepository();
    repo.seed({ id: 1, email: "u@t.fr", password: "hashed:x" });
    expect(await repo.getPasswordChangedAt(1)).toBeNull();
    expect(await logoutEverywhere(makeDeps(repo), 1)).toEqual({ success: true });
    expect(await repo.getPasswordChangedAt(1)).toBeInstanceOf(Date);
    expect((await repo.findCredentialsById(1))?.password).toBe("hashed:x");
  });
});
