import type { TenantContext } from "../../../shared/tenant";
import type { IImportErpRepository, ImportClientData, ImportDevisData, ImportFactureData } from "../application/import-erp-repository";
import type { ClientRef } from "../domain/import";

/*
 * Fake en mémoire de l'import ERP. Permet d'injecter des clients existants (dedup/lookup) et de capturer
 * les entités créées ; `failOn` simule une erreur d'insertion (pour la branche errors++ par ligne).
 */
export class ImportErpRepositoryFake implements IImportErpRepository {
  readonly createdClients: ImportClientData[] = [];
  readonly createdDevis: ImportDevisData[] = [];
  readonly createdFactures: ImportFactureData[] = [];
  private seq: number;

  constructor(
    private existing: ClientRef[] = [],
    private readonly failOn?: (kind: "client" | "devis" | "facture", index: number) => boolean,
  ) {
    this.seq = existing.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  }

  async listClients(_ctx: TenantContext): Promise<ClientRef[]> {
    return [...this.existing];
  }

  async createClient(_ctx: TenantContext, data: ImportClientData): Promise<void> {
    if (this.failOn?.("client", this.createdClients.length)) throw new Error("insert client échoué");
    const id = this.seq++;
    this.createdClients.push(data);
    /** Rend le client disponible pour un lookup ultérieur (parité : créé puis trouvable). */
    this.existing.push({ id, nom: data.nom, prenom: data.prenom ?? null, email: data.email ?? null });
  }

  async createDevisLight(_ctx: TenantContext, data: ImportDevisData): Promise<void> {
    if (this.failOn?.("devis", this.createdDevis.length)) throw new Error("insert devis échoué");
    this.createdDevis.push(data);
  }

  async createFactureLight(_ctx: TenantContext, data: ImportFactureData): Promise<void> {
    if (this.failOn?.("facture", this.createdFactures.length)) throw new Error("insert facture échoué");
    this.createdFactures.push(data);
  }

  /** Numéros déjà créés (préservés) + numéros existants seedés via `existingNumeros`. */
  existingNumeros: string[] = [];
  async listFactureNumeros(_ctx: TenantContext): Promise<string[]> {
    return [...this.existingNumeros, ...this.createdFactures.map((f) => f.numero).filter((n): n is string => !!n)];
  }
}
