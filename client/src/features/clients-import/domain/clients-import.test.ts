import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPhone, rowToPreview, parseRows, validCount, errorCount, toImportPayload } from "./clients-import";

describe("clients-import — domain pur", () => {
  it("isValidEmail / isValidPhone", () => {
    expect(isValidEmail("a@b.fr")).toBe(true);
    expect(isValidEmail("pas-email")).toBe(false);
    expect(isValidPhone("06 12 34 56 78")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });

  it("rowToPreview : en-têtes FR/techniques, validation nom/email/tel", () => {
    expect(rowToPreview({ Nom: "Dupont", "Prénom": "Jean", Email: "j@x.fr" })).toMatchObject({ nom: "Dupont", prenom: "Jean", email: "j@x.fr", status: "valid" });
    expect(rowToPreview({})).toMatchObject({ status: "error", error: "errNom" });
    expect(rowToPreview({ nom: "X", email: "bad" })).toMatchObject({ status: "error", error: "errEmail" });
    expect(rowToPreview({ nom: "X", telephone: "12" })).toMatchObject({ status: "error", error: "errTelephone" });
  });

  it("parseRows : filtre les lignes sans nom + counts", () => {
    const p = parseRows([{ nom: "A", email: "a@b.fr" }, { nom: "" }, { nom: "B", email: "bad" }]);
    expect(p).toHaveLength(2); // ligne vide filtrée
    expect(validCount(p)).toBe(1);
    expect(errorCount(p)).toBe(1);
  });

  it("toImportPayload : valides uniquement, sans status/error", () => {
    const p = parseRows([{ nom: "A", email: "a@b.fr" }, { nom: "B", email: "bad" }]);
    const payload = toImportPayload(p);
    expect(payload.clients).toHaveLength(1);
    expect(payload.clients[0]).not.toHaveProperty("status");
    expect(payload.clients[0]).not.toHaveProperty("error");
  });
});
