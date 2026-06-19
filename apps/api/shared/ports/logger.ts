/** Port logger applicatif — abstraction sur le transport réel (BetterStack, console, null). */
export interface AppLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

/** Implémentation console — pour les tests automatisés et le dev sans token BetterStack. */
/* eslint-disable no-console */
export class ConsoleLogger implements AppLogger {
  info(obj: Record<string, unknown>, msg: string): void {
    console.log("[INFO]", msg, obj);
  }
  warn(obj: Record<string, unknown>, msg: string): void {
    console.log("[WARN]", msg, obj);
  }
  error(obj: Record<string, unknown>, msg: string): void {
    console.log("[ERROR]", msg, obj);
  }
  debug(obj: Record<string, unknown>, msg: string): void {
    console.log("[DEBUG]", msg, obj);
  }
}
/* eslint-enable no-console */
