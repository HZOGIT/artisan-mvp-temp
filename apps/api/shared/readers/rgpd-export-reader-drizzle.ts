import { eq, inArray } from "drizzle-orm";
import {
  artisans,
  clients,
  devis,
  devisLignes,
  factures,
  facturesLignes,
  interventions,
  rdvEnLigne,
  depenses,
  notesDeFrais,
  chantiers,
  techniciens,
  vehicules,
  parametresArtisan,
} from "../../../../drizzle/schema.pg";
import type { DbClient } from "../db/client";
import { withTenant } from "../db/with-tenant";

export interface RgpdExportData {
  readonly version: "1.0";
  readonly exportedAt: string;
  readonly artisanId: number;
  readonly profil: Record<string, unknown> | null;
  readonly parametres: Record<string, unknown> | null;
  readonly clients: readonly Record<string, unknown>[];
  readonly devis: readonly Record<string, unknown>[];
  readonly factures: readonly Record<string, unknown>[];
  readonly interventions: readonly Record<string, unknown>[];
  readonly rdvEnLigne: readonly Record<string, unknown>[];
  readonly depenses: readonly Record<string, unknown>[];
  readonly notesDeFrais: readonly Record<string, unknown>[];
  readonly chantiers: readonly Record<string, unknown>[];
  readonly techniciens: readonly Record<string, unknown>[];
  readonly vehicules: readonly Record<string, unknown>[];
}

/** Supprime les champs techniques internes qui ne sont pas des données personnelles au sens RGPD. */
function omit<T extends Record<string, unknown>>(row: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    if (!keys.includes(k as keyof T)) out[k] = row[k as keyof T];
  }
  return out;
}

/**
 * Agrège toutes les données personnelles de l'artisan pour satisfaire une demande de portabilité
 * (Art. 20 RGPD). Double cloisonnement : RLS via `withTenant` + filtre explicite `artisanId`.
 * Champs exclus : `icalToken` (jeton interne), `logo` (binaire volumineux).
 */
export class RgpdExportReaderDrizzle {
  constructor(private readonly db: DbClient) {}

  async read(artisanId: number, userId: number): Promise<RgpdExportData> {
    return withTenant(this.db, { artisanId, userId }, async (tx) => {
      const [profilRow] = await tx.select().from(artisans).where(eq(artisans.id, artisanId));
      const profil = profilRow ? omit(profilRow as Record<string, unknown>, ["icalToken", "logo"]) : null;

      const [parametresRow] = await tx.select().from(parametresArtisan).where(eq(parametresArtisan.artisanId, artisanId));
      const parametres = parametresRow ? (parametresRow as Record<string, unknown>) : null;

      const clientsRows = await tx.select().from(clients).where(eq(clients.artisanId, artisanId));

      const devisRows = await tx.select().from(devis).where(eq(devis.artisanId, artisanId));
      const devisIds = devisRows.map((d) => d.id);
      const devisLignesRows = devisIds.length > 0
        ? await tx.select().from(devisLignes).where(inArray(devisLignes.devisId, devisIds))
        : [];
      const lignesParDevis = new Map<number, typeof devisLignesRows>();
      for (const l of devisLignesRows) {
        const list = lignesParDevis.get(l.devisId) ?? [];
        list.push(l);
        lignesParDevis.set(l.devisId, list);
      }
      const devisAvecLignes = devisRows.map((d) => ({ ...d, lignes: lignesParDevis.get(d.id) ?? [] }));

      const facturesRows = await tx.select().from(factures).where(eq(factures.artisanId, artisanId));
      const factureIds = facturesRows.map((f) => f.id);
      const facturesLignesRows = factureIds.length > 0
        ? await tx.select().from(facturesLignes).where(inArray(facturesLignes.factureId, factureIds))
        : [];
      const lignesParFacture = new Map<number, typeof facturesLignesRows>();
      for (const l of facturesLignesRows) {
        const list = lignesParFacture.get(l.factureId) ?? [];
        list.push(l);
        lignesParFacture.set(l.factureId, list);
      }
      const facturesAvecLignes = facturesRows.map((f) => ({ ...f, lignes: lignesParFacture.get(f.id) ?? [] }));

      const interventionsRows = await tx.select().from(interventions).where(eq(interventions.artisanId, artisanId));

      const rdvRows = await tx.select().from(rdvEnLigne).where(eq(rdvEnLigne.artisanId, artisanId));

      const depensesRows = await tx.select().from(depenses).where(eq(depenses.artisan_id, artisanId));

      const ndfRows = await tx.select().from(notesDeFrais).where(eq(notesDeFrais.artisan_id, artisanId));

      const chantiersRows = await tx.select().from(chantiers).where(eq(chantiers.artisanId, artisanId));

      const techniciensRows = await tx.select().from(techniciens).where(eq(techniciens.artisanId, artisanId));

      const vehiculesRows = await tx.select().from(vehicules).where(eq(vehicules.artisanId, artisanId));

      return {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        artisanId,
        profil,
        parametres,
        clients: clientsRows as readonly Record<string, unknown>[],
        devis: devisAvecLignes as readonly Record<string, unknown>[],
        factures: facturesAvecLignes as readonly Record<string, unknown>[],
        interventions: interventionsRows as readonly Record<string, unknown>[],
        rdvEnLigne: rdvRows as readonly Record<string, unknown>[],
        depenses: depensesRows as readonly Record<string, unknown>[],
        notesDeFrais: ndfRows as readonly Record<string, unknown>[],
        chantiers: chantiersRows as readonly Record<string, unknown>[],
        techniciens: techniciensRows as readonly Record<string, unknown>[],
        vehicules: vehiculesRows as readonly Record<string, unknown>[],
      };
    });
  }
}
