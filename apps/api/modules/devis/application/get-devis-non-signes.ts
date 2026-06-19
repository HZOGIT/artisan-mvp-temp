import type { TenantContext } from "../../../shared/tenant";
import type { ClientReader } from "../../../shared/readers/contact-readers";
import type { IDevisRepository } from "./devis-repository";
import type { DevisSignatureReader } from "./devis-signature-reader";

/** Dépendances de `getDevisNonSignes` (lecture seule : devis non signés enrichis client + signature). */
export interface DevisNonSignesDeps {
  readonly devisRepo: IDevisRepository;
  readonly clientReader: ClientReader;
  readonly signatureReader: DevisSignatureReader;
  readonly maintenant?: () => Date;
}

export interface DevisNonSigneItem {
  readonly devis: { readonly id: number; readonly numero: string; readonly dateDevis: Date; readonly totalTTC: string; readonly statut: string };
  readonly client: { readonly id: number; readonly nom: string; readonly email: string | null } | null;
  readonly signature: { readonly id: number; readonly token: string; readonly createdAt: Date } | null;
  readonly joursDepuisCreation: number;
  readonly joursDepuisEnvoi: number | null;
}

/*
 * Devis non signés de ≥ `joursMinimum` jours (parité legacy `devis.getDevisNonSignes`), enrichis du
 * client et de la signature (lien envoyé). Lecture scopée tenant (`listNonSignes`) ; la signature est
 * lue par devisId pour des devis déjà possédés (anti-IDOR par le parent).
 */
export async function getDevisNonSignes(
  deps: DevisNonSignesDeps,
  ctx: TenantContext,
  input: { joursMinimum?: number } = {},
): Promise<DevisNonSigneItem[]> {
  const joursMinimum = input.joursMinimum ?? 7;
  const now = (deps.maintenant ?? (() => new Date()))();
  const jours = (d: Date): number => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

  const nonSignes = await deps.devisRepo.listNonSignes(ctx);
  const results: DevisNonSigneItem[] = [];
  for (const d of nonSignes) {
    const joursDepuisCreation = jours(d.dateDevis);
    if (joursDepuisCreation < joursMinimum) continue;
    const client = await deps.clientReader.getClient(ctx, d.clientId);
    const signature = await deps.signatureReader.getByDevisId(ctx, d.id);
    results.push({
      devis: { id: d.id, numero: d.numero, dateDevis: d.dateDevis, totalTTC: d.totalTTC, statut: d.statut },
      client: client ? { id: client.id, nom: `${client.prenom ?? ""} ${client.nom}`.trim(), email: client.email } : null,
      signature: signature ? { id: signature.id, token: signature.token, createdAt: signature.createdAt } : null,
      joursDepuisCreation,
      joursDepuisEnvoi: signature ? jours(signature.createdAt) : null,
    });
  }
  return results;
}
