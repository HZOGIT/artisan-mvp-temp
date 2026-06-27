import type { DbClient } from "../../shared/db";
import type { PaPort } from "./application/pa-port";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { SuperPdpPaAdapter } from "../../shared/ports/superpdp-pa-adapter";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";

export interface EinvoicingModule {
  readonly pa: PaPort;
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
  let pa: PaPort;
  switch (provider) {
    case "superpdp":
      pa = new SuperPdpPaAdapter(
        env.SUPERPDP_CLIENT_ID ?? "",
        env.SUPERPDP_CLIENT_SECRET ?? "",
        env.SUPERPDP_BASE_URL ?? (env.NODE_ENV === "production" ? "https://api.superpdp.tech" : "https://sandbox.superpdp.tech"),
      );
      break;
    default:
      pa = new FakePaAdapter();
  }
  return { pa, router: createEinvoicingRouter(pa, db) };
}
