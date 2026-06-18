// Registres de parité edge↔src (anti-drift), consommés par `createAppRouter` et le test
// `edge-dispatch.test`. La mécanique de routage par flags (flags/router-decision/dispatch/
// gateway-proxy) a été retirée : le dispatcher edge est mono-stack (extinction du legacy).
export * from "./migrated-domains";
export * from "./migrated-routes";
