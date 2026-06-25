import { describe, it, expect } from "vitest";
import { signAuthToken, verifyAuthToken } from "./jwt";

const SECRET = "test-secret-at-least-32-characters-long-xxxx";

describe("signAuthToken (émission JWT, contrepartie de verifyAuthToken)", () => {
  it("round-trip : un token signé est vérifiable et restitue les claims", async () => {
    const token = await signAuthToken({ userId: 42, email: "u@t.fr" }, SECRET);
    expect(await verifyAuthToken(token, SECRET)).toMatchObject({ userId: 42, email: "u@t.fr" });
  });

  it("inter-opérabilité : signé avec le secret legacy → vérifiable par le new-stack (même secret)", async () => {
    // Émule un token émis par le legacy (mêmes claims/algo/secret) → le new-stack doit le valider.
    const token = await signAuthToken({ userId: 7, email: "legacy@t.fr" }, SECRET);
    expect(await verifyAuthToken(token, SECRET)).toMatchObject({ userId: 7 });
  });

  it("secret différent → rejet (null)", async () => {
    const token = await signAuthToken({ userId: 1, email: "u@t.fr" }, SECRET);
    expect(await verifyAuthToken(token, "un-autre-secret-de-plus-de-32-caracteres!!")).toBeNull();
  });

  it("token expiré → rejet (null)", async () => {
    const past = Math.floor(Date.now() / 1000) - 60; // expiré il y a 60 s
    const token = await signAuthToken({ userId: 1, email: "u@t.fr" }, SECRET, past);
    expect(await verifyAuthToken(token, SECRET)).toBeNull();
  });
});
