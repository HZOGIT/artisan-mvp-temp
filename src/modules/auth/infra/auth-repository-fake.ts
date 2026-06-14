import type { IAuthRepository } from "../application/auth-repository";
import type { AuthCredentials, AuthUser } from "../domain/auth";

interface FakeAuthUser extends AuthUser {
  password: string | null;
}

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
}
