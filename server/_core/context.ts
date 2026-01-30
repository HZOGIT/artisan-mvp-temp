import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getUserFromRequest } from "./auth-simple";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: Awaited<ReturnType<typeof getUserFromRequest>>;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await getUserFromRequest(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
