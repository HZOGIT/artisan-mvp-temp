import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // MODE DEMO pour Railway - bypass auth temporairement pour tests
  const hostname = opts.req.hostname || '';
  const isRailway = hostname.includes('railway.app');
  const isDemoMode = process.env.DEMO_MODE === 'true' || isRailway;

  if (isDemoMode && isRailway) {
    console.log('[DEMO MODE] Railway detected - using demo user for testing');
    user = {
      id: 1,
      openId: 'demo-railway-123',
      name: 'Demo Railway User',
      email: 'demo@railway-test.fr',
      loginMethod: 'demo',
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as User;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
