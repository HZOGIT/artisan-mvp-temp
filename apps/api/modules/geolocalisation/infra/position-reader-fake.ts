import type { TenantContext } from "../../../shared/tenant";
import type { ITechnicienPositionReader } from "../application/position-reader";
import type { TechnicienAvecPosition } from "../domain/position";

/** Lecteur fake déterministe : techniciens (+ dernière position) par tenant. */
export class FakeTechnicienPositionReader implements ITechnicienPositionReader {
  private readonly byTenant = new Map<number, TechnicienAvecPosition[]>();

  seed(artisanId: number, techs: TechnicienAvecPosition[]): void {
    this.byTenant.set(artisanId, techs);
  }

  async getPositions(ctx: TenantContext): Promise<TechnicienAvecPosition[]> {
    return [...(this.byTenant.get(ctx.artisanId) ?? [])];
  }
}
