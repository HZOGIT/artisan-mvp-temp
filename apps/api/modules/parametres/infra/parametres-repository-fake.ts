import type { TenantContext } from "../../../shared/tenant";
import type { IParametresRepository } from "../application/parametres-repository";
import { defaultParametres } from "../domain/parametres";
import type { ParametresArtisan, UpdateParametresInput } from "../domain/parametres";

// Implémentation in-memory du repository parametres (tests sans DB). Reproduit les invariants du
// repo Drizzle : singleton par artisanId, défauts si absent (jamais null), upsert qui ne fusionne
// QUE les champs config (jamais les compteurs), `artisanId` forcé au tenant.
export class FakeParametresRepository implements IParametresRepository {
  private readonly store = new Map<number, ParametresArtisan>();

  // Permet aux tests de simuler une ligne préexistante (ex. compteurs déjà avancés par la
  // numérotation) afin de vérifier que l'upsert config ne les écrase pas.
  seed(p: ParametresArtisan): void {
    this.store.set(p.artisanId, p);
  }

  async get(ctx: TenantContext): Promise<ParametresArtisan> {
    return this.store.get(ctx.artisanId) ?? defaultParametres(ctx.artisanId);
  }

  async upsert(ctx: TenantContext, input: UpdateParametresInput): Promise<ParametresArtisan> {
    const current = this.store.get(ctx.artisanId) ?? defaultParametres(ctx.artisanId);
    // Fusionne uniquement les champs config fournis ; compteurs (et artisanId) préservés tels quels.
    const next: ParametresArtisan = {
      ...current,
      artisanId: ctx.artisanId,
      ...(input.prefixeDevis !== undefined ? { prefixeDevis: input.prefixeDevis } : {}),
      ...(input.prefixeFacture !== undefined ? { prefixeFacture: input.prefixeFacture } : {}),
      ...(input.prefixeAvoir !== undefined ? { prefixeAvoir: input.prefixeAvoir } : {}),
      ...(input.mentionsLegales !== undefined ? { mentionsLegales: input.mentionsLegales } : {}),
      ...(input.conditionsGenerales !== undefined ? { conditionsGenerales: input.conditionsGenerales } : {}),
      ...(input.conditionsPaiementDefaut !== undefined ? { conditionsPaiementDefaut: input.conditionsPaiementDefaut } : {}),
      ...(input.delaiPaiementJours !== undefined ? { delaiPaiementJours: input.delaiPaiementJours } : {}),
      ...(input.delaiPaiementType !== undefined ? { delaiPaiementType: input.delaiPaiementType } : {}),
      ...(input.notificationsEmail !== undefined ? { notificationsEmail: input.notificationsEmail } : {}),
      ...(input.rappelDevisJours !== undefined ? { rappelDevisJours: input.rappelDevisJours } : {}),
      ...(input.rappelFactureJours !== undefined ? { rappelFactureJours: input.rappelFactureJours } : {}),
      ...(input.objectifCA !== undefined ? { objectifCA: input.objectifCA } : {}),
      ...(input.objectifDevis !== undefined ? { objectifDevis: input.objectifDevis } : {}),
      ...(input.objectifClients !== undefined ? { objectifClients: input.objectifClients } : {}),
      ...(input.couleurPrincipale !== undefined ? { couleurPrincipale: input.couleurPrincipale } : {}),
      ...(input.couleurSecondaire !== undefined ? { couleurSecondaire: input.couleurSecondaire } : {}),
    };
    this.store.set(ctx.artisanId, next);
    return next;
  }
}
