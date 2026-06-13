import { initTRPC, TRPCError } from "@trpc/server";
import type { AppContext } from "./context";
import type { TenantContext } from "../../shared/tenant";

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Procédure protégée : exige un TenantContext résolu. Narrowe le contexte pour exposer
// `tenant` non-null aux résolveurs en aval.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.tenant) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentification requise" });
  }
  const tenant: TenantContext = ctx.tenant;
  return next({ ctx: { ...ctx, tenant } });
});
