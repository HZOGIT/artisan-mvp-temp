import { describe, it, expect } from "vitest";
import { zipEntries } from "./zip-entries";

const ZIP_LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" en-tête de fichier local
const ZIP_EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // "PK\x05\x06" fin d'archive (zip vide)

describe("zipEntries", () => {
  it("produit un Buffer ZIP valide (magic PK) contenant le nom d'entrée", async () => {
    const buf = await zipEntries([{ name: "rapport.txt", content: "bonjour" }]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).equals(ZIP_LOCAL)).toBe(true);
    expect(buf.includes(Buffer.from("rapport.txt"))).toBe(true); // nom stocké en clair
  });

  it("inclut toutes les entrées (plusieurs fichiers)", async () => {
    const buf = await zipEntries([
      { name: "a/devis.csv", content: "x;y" },
      { name: "b/facture.csv", content: "1;2" },
    ]);
    expect(buf.includes(Buffer.from("a/devis.csv"))).toBe(true);
    expect(buf.includes(Buffer.from("b/facture.csv"))).toBe(true);
  });

  it("accepte un contenu binaire (Buffer) sans erreur", async () => {
    const bin = Buffer.from([0x00, 0x01, 0x02, 0xff]);
    const buf = await zipEntries([{ name: "blob.bin", content: bin }]);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.includes(Buffer.from("blob.bin"))).toBe(true);
  });

  it("liste vide → archive ZIP vide valide (signature EOCD)", async () => {
    const buf = await zipEntries([]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.includes(ZIP_EOCD)).toBe(true);
  });
});
