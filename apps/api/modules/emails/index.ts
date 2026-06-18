export { createEmailsModule } from "./emails.module";
export type { EmailsModule, EmailsModuleDeps } from "./emails.module";
export type { IEmailLogReader } from "./application/email-log-reader";
export { EmailLogReaderDrizzle } from "./infra/email-log-reader-drizzle";
export type { EmailLogEntry, EmailLogFilter } from "./domain/email-log";
