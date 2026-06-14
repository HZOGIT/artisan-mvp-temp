import type { IAuthRepository } from "../application/auth-repository";
import type { AuthCredentials, AuthUser } from "../domain/auth";

// Vue mutable interne (AuthUser est readonly côté domaine ; le fake mute email/actif/password…).
type FakeAuthUser = { -readonly [K in keyof AuthUser]: AuthUser[K] } & {
  password: string | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
};

// Repo auth fake in-memory déterministe. `password` stocké tel quel (les tests utilisent FakePasswordHasher).
export class FakeAuthRepository implements IAuthRepository {
  private readonly users: FakeAuthUser[] = [];
  public touched: number[] = [];

  seed(u: Partial<FakeAuthUser> & { id: number; email: string }): FakeAuthUser {
    const full: FakeAuthUser = { name: null, prenom: null, role: "artisan", artisanId: null, actif: true, password: null, ...u };
    this.users.push(full);
    return full;
  }

  async findCredentials(email: string): Promise<AuthCredentials | null> {
    const u = this.users.find((x) => x.email === email);
    return u ? { id: u.id, email: u.email, password: u.password, actif: u.actif } : null;
  }

  async getById(userId: number): Promise<AuthUser | null> {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    const { password: _pw, ...user } = u;
    return user;
  }

  async touchLastSignedIn(userId: number): Promise<void> {
    this.touched.push(userId);
  }

  async findCredentialsById(userId: number): Promise<AuthCredentials | null> {
    const u = this.users.find((x) => x.id === userId);
    return u ? { id: u.id, email: u.email, password: u.password, actif: u.actif } : null;
  }

  async findIdByEmail(email: string): Promise<number | null> {
    return this.users.find((x) => x.email === email)?.id ?? null;
  }

  async updateEmail(userId: number, email: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.email = email;
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.password = passwordHash;
  }

  async setResetToken(userId: number, tokenHash: string, expiry: Date): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.resetToken = tokenHash;
      u.resetTokenExpiry = expiry;
    }
  }

  async findByValidResetToken(tokenHash: string): Promise<{ id: number } | null> {
    const u = this.users.find((x) => x.resetToken === tokenHash && x.resetTokenExpiry != null && x.resetTokenExpiry.getTime() >= Date.now());
    return u ? { id: u.id } : null;
  }

  async resetPasswordWithToken(userId: number, passwordHash: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.password = passwordHash;
      u.resetToken = null;
      u.resetTokenExpiry = null;
    }
  }

  async softDelete(userId: number, neutralizedEmail: string): Promise<void> {
    const u = this.users.find((x) => x.id === userId);
    if (u) {
      u.actif = false;
      u.email = neutralizedEmail;
    }
  }
}
