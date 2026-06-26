import type { PaPort } from "./application/pa-port";
import { FakePaAdapter } from "./infra/fake-pa-adapter";
import { createEinvoicingRouter } from "./interface/trpc/einvoicing.router";

export interface EinvoicingModule {
  readonly pa: PaPort;
  readonly router: ReturnType<typeof createEinvoicingRouter>;
}

export function buildEinvoicingModule(env: { PA_PROVIDER?: string }): EinvoicingModule {
  const provider = env.PA_PROVIDER ?? "fake";
  let pa: PaPort;
  switch (provider) {
    default:
      pa = new FakePaAdapter();
  }
  return { pa, router: createEinvoicingRouter(pa) };
}
