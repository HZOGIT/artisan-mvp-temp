// Port de hachage de mot de passe. Les use-cases (invite collaborateur, plus tard auth/login/reset)
// en dépendent — jamais d'une impl concrète. Algo épinglé = **bcrypt** (parité legacy `hashPassword`).
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
