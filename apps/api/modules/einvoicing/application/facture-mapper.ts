import { eq } from "drizzle-orm";
import type { DbClient } from "../../../shared/db";
import {
  factures,
  facturesLignes,
  artisans,
  clients,
} from "../../../../../drizzle/schema.pg";
import type { Facture, FactureLigne } from "../../../../../drizzle/schema.pg";
import type { Artisan } from "../../../../../drizzle/schema.pg";
import type { Client } from "../../../../../drizzle/schema.pg";
import type { PaInvoicePayload, PaLine, PaParty, PaTvaBreakdown } from "../domain/einvoicing";

function toCents(s: string | null | undefined): bigint {
  if (!s) return 0n;
  const dot = s.indexOf(".");
  if (dot === -1) return BigInt(s) * 100n;
  const int = s.slice(0, dot) || "0";
  const dec = (s.slice(dot + 1) + "00").slice(0, 2);
  return BigInt(int) * 100n + BigInt(dec);
}

function fromCents(c: bigint): string {
  const neg = c < 0n;
  const abs = neg ? -c : c;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** Pure mapping — testable without DB. */
export function mapToPayload(
  facture: Facture,
  artisan: Artisan,
  client: Client,
  lignes: FactureLigne[],
): PaInvoicePayload {
  const produits = lignes.filter((l) => l.type === "produit");

  const emetteur: PaParty = {
    siret: artisan.siret ?? null,
    nom: artisan.nomEntreprise ?? "",
    email: artisan.email ?? null,
    adresse: artisan.adresse ?? null,
    codePostal: artisan.codePostal ?? null,
    ville: artisan.ville ?? null,
  };

  const destinataire: PaParty = {
    siret: facture.siretDestinataire ?? client.siret ?? null,
    nom: client.raisonSociale ?? `${client.prenom ?? ""} ${client.nom}`.trim(),
    email: client.email ?? null,
    adresse: client.adresse ?? null,
    codePostal: client.codePostal ?? null,
    ville: client.ville ?? null,
  };

  const paLignes: PaLine[] = produits.map((l) => ({
    description: l.designation,
    quantite: Number(l.quantite ?? "1"),
    prixUnitaireHT: l.prixUnitaireHT,
    tauxTva: l.tauxTVA ?? "20.00",
    montantHT: l.montantHT ?? "0.00",
    montantTva: l.montantTVA ?? "0.00",
    montantTTC: l.montantTTC ?? "0.00",
  }));

  const byTaux = new Map<string, [bigint, bigint]>();
  for (const l of produits) {
    const taux = l.tauxTVA ?? "20.00";
    const prev = byTaux.get(taux) ?? [0n, 0n];
    byTaux.set(taux, [prev[0] + toCents(l.montantHT), prev[1] + toCents(l.montantTVA)]);
  }
  const tvaBreakdown: PaTvaBreakdown[] = [...byTaux.entries()].map(([taux, [ht, tva]]) => ({
    taux,
    baseHT: fromCents(ht),
    montantTva: fromCents(tva),
  }));

  const franchiseMention =
    artisan.franchiseTVA || artisan.formeJuridique === "micro"
      ? "Auto-entrepreneur non soumis à TVA — art. 293B CGI"
      : undefined;

  const result: PaInvoicePayload = {
    typeDocument: facture.typeDocument ?? "facture",
    numero: facture.numero ?? String(facture.id),
    date: facture.dateFacture.toISOString().slice(0, 10),
    emetteur,
    destinataire,
    lignes: paLignes,
    tvaBreakdown,
    totalHT: facture.totalHT ?? "0.00",
    totalTva: facture.totalTVA ?? "0.00",
    totalTTC: facture.totalTTC ?? "0.00",
  };

  if (facture.dateEcheance) result.dateEcheance = facture.dateEcheance.toISOString().slice(0, 10);
  if (franchiseMention) result.mentionLegale = franchiseMention;

  return result;
}

export async function buildPaPayload(db: DbClient, factureId: number): Promise<PaInvoicePayload> {
  const [facture] = await db.select().from(factures).where(eq(factures.id, factureId));
  if (!facture) throw new Error(`Facture ${factureId} introuvable`);

  const [artisan, client, lignes] = await Promise.all([
    db.select().from(artisans).where(eq(artisans.id, facture.artisanId)).then((r) => r[0]),
    db.select().from(clients).where(eq(clients.id, facture.clientId)).then((r) => r[0]),
    db.select().from(facturesLignes).where(eq(facturesLignes.factureId, factureId)),
  ]);

  if (!artisan) throw new Error(`Artisan ${facture.artisanId} introuvable`);
  if (!client) throw new Error(`Client ${facture.clientId} introuvable`);

  return mapToPayload(facture, artisan, client, lignes);
}
