import archiver from "archiver";

/*
 * Assemble une liste d'entrées (nom + contenu texte/binaire) en archive ZIP, bufferisée. `archiver`
 * expose un flux Readable ; on le concatène en Buffer (volumes d'export en lot modestes → bufferisation
 * acceptable et plus simple à câbler/tester qu'un pipe direct dans la réponse). Niveau de compression
 * 5 par défaut (parité legacy). Rejette sur erreur du flux ou de finalisation.
 */
export function zipEntries(entries: readonly { name: string; content: string | Buffer }[], level = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level } });
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    archive.on("warning", reject);
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const e of entries) archive.append(e.content, { name: e.name });
    archive.finalize().catch(reject);
  });
}
