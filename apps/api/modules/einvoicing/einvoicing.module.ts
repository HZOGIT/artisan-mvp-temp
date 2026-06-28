import type { DbClient } from "../../shared/db";
import type { PaPort } from "./application/pa-port";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { SuperPdpPaAdapter } from "../../shared/ports/superpdp-pa-adapter";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";

export interface EinvoicingModule {
  readonly pa: PaPort;
  readonly superpdpAdapter: SuperPdpPaAdapter | null;
  readonly paDisponible: boolean;
  readonly router: ReturnType<typeof createEinvoicingRouter>;
}

export interface EinvoicingEnv {
  PA_PROVIDER?: string;
  SUPERPDP_CLIENT_ID?: string;
  SUPERPDP_CLIENT_SECRET?: string;
  SUPERPDP_BASE_URL?: string;
  NODE_ENV?: string;
}

export function buildEinvoicingModule(env: EinvoicingEnv, db: DbClient): EinvoicingModule {
  const provider = env.PA_PROVIDER ?? "fake";
  const paDisponible = provider === "superpdp";
  let pa: PaPort;
  let superpdpAdapter: SuperPdpPaAdapter | null = null;
  switch (provider) {
    case "superpdp":
      superpdpAdapter = new SuperPdpPaAdapter(
        env.SUPERPDP_CLIENT_ID ?? "",
        env.SUPERPDP_CLIENT_SECRET ?? "",
        env.SUPERPDP_BASE_URL ?? (env.NODE_ENV === "production" ? "https://api.superpdp.tech" : "https://sandbox.superpdp.tech"),
        db,
      );
      pa = superpdpAdapter;
      break;
    default:
      pa = new FakePaAdapter();
  }
  return { pa, superpdpAdapter, paDisponible, router: createEinvoicingRouter(pa, db, paDisponible) };
}
