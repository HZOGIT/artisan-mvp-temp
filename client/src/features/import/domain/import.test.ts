import { describe, expect, it } from "vitest";
import { detectSeparator, parseCsvLine, parseCsv, autoMap, allRequiredMapped, bytesToHuman, KIND_FIELDS } from "./import";

describe("import — domain pur", () => {
  it("detectSeparator : ; / , / tab dominant", () => {
    expect(detectSeparator("a;b;c\n1;2;3")).toBe(";");
    expect(detectSeparator("a,b,c\n1,2,3")).toBe(",");
    expect(detectSeparator("a\tb\tc")).toBe("\t");
  });

  it("parseCsvLine : gère les guillemets doublés + séparateur dans les quotes", () => {
    expect(parseCsvLine('a,b,c', ",")).toEqual(["a", "b", "c"]);
    expect(parseCsvLine('"Dupont, SARL","x"', ",")).toEqual(["Dupont, SARL", "x"]);
    expect(parseCsvLine('"a ""b"" c"', ",")).toEqual(['a "b" c']);
  });

  it("parseCsv : en-têtes + lignes objets", () => {
    const { headers, rows, sep } = parseCsv("nom;email\nDupont;d@x.fr\nMartin;m@x.fr");
    expect(sep).toBe(";");
    expect(headers).toEqual(["nom", "email"]);
    expect(rows).toEqual([{ nom: "Dupont", email: "d@x.fr" }, { nom: "Martin", email: "m@x.fr" }]);
  });

  it("autoMap : associe par nom normalisé (a-z only ; les accents sont retirés)", () => {
    const m = autoMap(["Nom", "E-mail", "Telephone"], KIND_FIELDS.clients.fields);
    expect(m["Nom"]).toBe("nom");
    expect(m["Telephone"]).toBe("telephone");
    expect(m["E-mail"]).toBe("email");
    // limitation legacy : un en-tête accentué (« Téléphone » → « tlphone ») ne matche pas.
    expect(autoMap(["Téléphone"], KIND_FIELDS.clients.fields)["Téléphone"]).toBeUndefined();
  });

  it("allRequiredMapped : exige les champs obligatoires", () => {
    expect(allRequiredMapped(KIND_FIELDS.clients.fields, { Nom: "nom" })).toBe(true);
    expect(allRequiredMapped(KIND_FIELDS.clients.fields, { Email: "email" })).toBe(false);
  });

  it("bytesToHuman : o / Ko / Mo", () => {
    expect(bytesToHuman(512)).toBe("512 o");
    expect(bytesToHuman(2048)).toBe("2.0 Ko");
    expect(bytesToHuman(3 * 1024 * 1024)).toBe("3.0 Mo");
  });
});
