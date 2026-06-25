import type { TenantContext } from "../../../shared/tenant";
import { tauxStringToCategorie } from "../../../shared/tva/taux-tva-fr";
import type { IImportErpRepository } from "./import-erp-repository";
import { pickField, findClientByName, emptyResult, type ImportRow, type ImportMapping, type ImportResult } from "../domain/import";

export interface ImportInput {
  readonly rows: readonly ImportRow[];
  readonly mapping: ImportMapping;
}

const JOUR_MS = 86_400_000;

/*
 * Importe des clients (parité legacy `importClients`). Dedup par email (existants + dans le lot) :
 * `nom` requis sinon erreur de ligne. Renvoie les compteurs {imported,errors,duplicates,errorDetails}.
 */
export async function importClients(repo: IImportErpRepository, ctx: TenantContext, input: ImportInput): Promise<ImportResult> {
  const existing = await repo.listClients(ctx);
  const seenEmails = new Set(existing.map((c) => (c.email || "").toLowerCase().trim()).filter((e) => e.length > 0));
  const res = emptyResult();

  let lineNum = 1;
  for (const row of input.rows) {
    lineNum++;
    try {
      const nom = pickField(row, input.mapping, "nom");
      if (!nom) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : nom manquant`);
        continue;
      }
      const email = pickField(row, input.mapping, "email")?.toLowerCase();
      if (email && seenEmails.has(email)) {
        res.duplicates++;
        continue;
      }
      await repo.createClient(ctx, {
        nom,
        prenom: pickField(row, input.mapping, "prenom"),
        email,
        telephone: pickField(row, input.mapping, "telephone"),
        adresse: pickField(row, input.mapping, "adresse"),
        codePostal: pickField(row, input.mapping, "codePostal"),
        ville: pickField(row, input.mapping, "ville"),
        notes: pickField(row, input.mapping, "notes"),
      });
      res.imported++;
      if (email) seenEmails.add(email);
    } catch (err) {
      res.errors++;
      res.errorDetails.push(`Ligne ${lineNum} : ${(err as Error)?.message || "erreur"}`);
    }
  }
  return res;
}

/*
 * Importe des devis « légers » (parité legacy `importDevis`). Le client est résolu par nom (lookup) ;
 * introuvable → erreur de ligne (« importez d'abord les clients »). Validité = dateDevis + 30 jours.
 */
export async function importDevis(repo: IImportErpRepository, ctx: TenantContext, input: ImportInput): Promise<ImportResult> {
  const clients = await repo.listClients(ctx);
  const res = emptyResult();

  let lineNum = 1;
  for (const row of input.rows) {
    lineNum++;
    try {
      const nomClient = pickField(row, input.mapping, "nomClient");
      if (!nomClient) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : nomClient manquant`);
        continue;
      }
      const client = findClientByName(clients, nomClient);
      if (!client) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : client "${nomClient}" introuvable (importez d'abord les clients)`);
        continue;
      }
      const dateDevisStr = pickField(row, input.mapping, "dateDevis");
      const dateDevis = dateDevisStr ? new Date(dateDevisStr) : new Date();
      await repo.createDevisLight(ctx, {
        clientId: client.id,
        objet: pickField(row, input.mapping, "objetDevis") || "Devis importé",
        statut: pickField(row, input.mapping, "statut") || "brouillon",
        dateDevis,
        dateValidite: new Date(dateDevis.getTime() + 30 * JOUR_MS),
        totalTTC: pickField(row, input.mapping, "totalTTC") || "0",
        notes: pickField(row, input.mapping, "notes"),
      });
      res.imported++;
    } catch (err) {
      res.errors++;
      res.errorDetails.push(`Ligne ${lineNum} : ${(err as Error)?.message || "erreur"}`);
    }
  }
  return res;
}

/*
 * Importe des factures « légères » (parité legacy `importFactures`). Client résolu par nom ; échéance =
 * dateFacture + 30 jours. Crée une ligne synthétique HT/TVA à partir du TTC + tauxTVA optionnel.
 */
export async function importFactures(repo: IImportErpRepository, ctx: TenantContext, input: ImportInput): Promise<ImportResult> {
  const clients = await repo.listClients(ctx);
  const res = emptyResult();
  /*
   * Numéros déjà présents (existants + au fil de l'import) → on REFUSE un doublon plutôt que de
   * ré-attribuer silencieusement (numéro légal immuable). Vide tant qu'aucun `numeroFacture` n'est mappé.
   */
  const numerosVus = new Set(await repo.listFactureNumeros(ctx));

  let lineNum = 1;
  for (const row of input.rows) {
    lineNum++;
    try {
      const nomClient = pickField(row, input.mapping, "nomClient");
      if (!nomClient) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : nomClient manquant`);
        continue;
      }
      const client = findClientByName(clients, nomClient);
      if (!client) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : client "${nomClient}" introuvable`);
        continue;
      }
      /** Numéro LÉGAL d'origine : préservé s'il est mappé ; refusé s'il existe déjà (doublon). */
      const numeroOrigine = pickField(row, input.mapping, "numeroFacture")?.trim() || undefined;
      if (numeroOrigine && numerosVus.has(numeroOrigine)) {
        res.errors++;
        res.errorDetails.push(`Ligne ${lineNum} : numéro de facture "${numeroOrigine}" déjà présent (doublon)`);
        continue;
      }
      const dateFactStr = pickField(row, input.mapping, "dateFacture");
      const datePaiementStr = pickField(row, input.mapping, "datePaiement");
      const dateFacture = dateFactStr ? new Date(dateFactStr) : new Date();
      const totalTTCStr = pickField(row, input.mapping, "totalTTC") || "0";
      const totalTTC = parseFloat(totalTTCStr);
      const totalHTStr = pickField(row, input.mapping, "totalHT");
      const tauxTVAStr = pickField(row, input.mapping, "tauxTVA");
      const tauxTVA = tauxTVAStr ? parseFloat(tauxTVAStr) : 20.00;
      let totalHT: number;
      if (totalHTStr) {
        totalHT = parseFloat(totalHTStr);
      } else {
        totalHT = parseFloat((totalTTC / (1 + tauxTVA / 100)).toFixed(2));
      }
      const montantTVA = parseFloat((totalTTC - totalHT).toFixed(2));
      const tvaCategorieId = tauxStringToCategorie(tauxTVA);
      const lignes = [
        {
          designation: "Reprise historique",
          quantite: "1",
          prixUnitaireHT: totalHT.toFixed(2),
          tauxTVA: tauxTVA.toFixed(2),
          tvaCategorieId,
          montantHT: totalHT.toFixed(2),
          montantTVA: montantTVA.toFixed(2),
        },
      ];
      await repo.createFactureLight(ctx, {
        clientId: client.id,
        numero: numeroOrigine,
        objet: pickField(row, input.mapping, "objetFacture") || "Facture importée",
        statut: pickField(row, input.mapping, "statut") || "brouillon",
        dateFacture,
        dateEcheance: new Date(dateFacture.getTime() + 30 * JOUR_MS),
        datePaiement: datePaiementStr ? new Date(datePaiementStr) : undefined,
        modePaiement: pickField(row, input.mapping, "modePaiement"),
        totalTTC: totalTTCStr,
        lignes,
      });
      /** anti-doublon intra-lot */
      if (numeroOrigine) numerosVus.add(numeroOrigine);
      res.imported++;
    } catch (err) {
      res.errors++;
      res.errorDetails.push(`Ligne ${lineNum} : ${(err as Error)?.message || "erreur"}`);
    }
  }
  return res;
}
