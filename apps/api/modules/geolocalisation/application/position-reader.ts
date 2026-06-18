import type { TenantContext } from "../../../shared/tenant";
import type { TechnicienAvecPosition } from "../domain/position";

// Port de lecture des positions : techniciens du tenant + leur dernière position. Scoping garanti par
// l'implémentation (techniciens sous RLS ; positions rattachées via le technicien parent).
export interface ITechnicienPositionReader {
  getPositions(ctx: TenantContext): Promise<TechnicienAvecPosition[]>;
}
