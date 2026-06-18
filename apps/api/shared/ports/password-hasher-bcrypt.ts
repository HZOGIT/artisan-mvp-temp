import type { PasswordHasher } from "./password-hasher";

// Impl bcrypt du PasswordHasher (parité legacy `server/_core/auth.ts` : genSalt(10) + hash). L'import
// est résolu via une variable (non littérale) → bcryptjs n'entre pas dans le typecheck de src/**,
// tout en étant câblé au runtime (esbuild le bundle).
const BCRYPT_MODULE = "bcryptjs";
type BcryptModule = {
  genSalt: (rounds: number) => Promise<string>;
  hash: (s: string, salt: string) => Promise<string>;
  compare: (s: string, hash: string) => Promise<boolean>;
};

async function bcrypt(): Promise<BcryptModule> {
  const mod = (await import(BCRYPT_MODULE)) as { default?: BcryptModule } & BcryptModule;
  return mod.default ?? mod;
}

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const b = await bcrypt();
    return b.hash(password, await b.genSalt(10));
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return (await bcrypt()).compare(password, hash);
  }
}

// Fake déterministe (tests) : « hash » réversible, aucune dépendance crypto.
export class FakePasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hashed:${password}`;
  }
  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `hashed:${password}`;
  }
}
