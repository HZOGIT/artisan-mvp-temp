import type { IEmailLogReader } from "./application/email-log-reader";
import { createEmailsRouter } from "./interface/trpc/emails.router";

/** Wiring DI du module « emails » (journal d'envois, lecture seule). */
export interface EmailsModuleDeps {
  readonly reader: IEmailLogReader;
}

export interface EmailsModule {
  readonly deps: EmailsModuleDeps;
  readonly router: ReturnType<typeof createEmailsRouter>;
}

export function createEmailsModule(deps: EmailsModuleDeps): EmailsModule {
  return { deps, router: createEmailsRouter(deps.reader) };
}
