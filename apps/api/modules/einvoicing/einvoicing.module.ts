import type { DbClient } from "../../shared/db";
import type { PaPort } from "./application/pa-port";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";
import { paInboundPollerPlugin } from "../../shared/infra/pa-inbound-poller";

export interface EinvoicingModule {
  readonly pa: PaPort;
  readonly router: ReturnType<typeof createEinvoicingRouter>;
  readonly inboundPollerPlugin: typeof paInboundPollerPlugin;
}

export function buildEinvoicingModule(env: { PA_PROVIDER?: string }, db: DbClient): EinvoicingModule {
  const provider = env.PA_PROVIDER ?? "fake";
  let pa: PaPort;
  switch (provider) {
    default:
      pa = new FakePaAdapter();
  }
  return { pa, router: createEinvoicingRouter(pa, db), inboundPollerPlugin: paInboundPollerPlugin };
}
