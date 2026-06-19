import type { TenantContext } from "../../../shared/tenant";
import type { TechnicienAvecPosition } from "../domain/position";
import type { ITechnicienPositionReader } from "./position-reader";

/** Dernières positions des techniciens du tenant (carte de géolocalisation). Lecture seule, scopée. */
export function getPositions(reader: ITechnicienPositionReader, ctx: TenantContext): Promise<TechnicienAvecPosition[]> {
  return reader.getPositions(ctx);
}
