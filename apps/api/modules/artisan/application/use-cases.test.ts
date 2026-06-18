import { describe, it, expect } from "vitest";
import { FakeArtisanRepository } from "../infra/artisan-repository-fake";
import { getProfile, updateProfile } from "./use-cases";
import { ConflictError, ValidationError } from "../../../shared/errors";
import type { TenantContext } from "../../../shared/tenant";

const A: TenantContext = { artisanId: 1, userId: 10 };
const B: TenantContext = { artisanId: 2, userId: 20 };

describe("artisan — use-cases profil", () => {
  it("getProfile renvoie le profil du tenant courant (ou null)", async () => {
    const repo = new FakeArtisanRepository();
    repo.seed({ id: 1, nomEntreprise: "Plomberie A" });
    expect((await getProfile(repo, A))?.nomEntreprise).toBe("Plomberie A");
    expect(await getProfile(repo, B)).toBeNull();
  });

  it("updateProfile applique les champs fournis (scopé au tenant courant)", async () => {
    const repo = new FakeArtisanRepository();
    repo.seed({ id: 1, nomEntreprise: "Avant", ville: "Lyon" });
    const maj = await updateProfile(repo, A, { nomEntreprise: "Après" });
    expect(maj.nomEntreprise).toBe("Après");
    expect(maj.ville).toBe("Lyon"); // champ non fourni préservé
  });

  it("updateProfile : IBAN invalide → ValidationError ; IBAN valide accepté", async () => {
    const repo = new FakeArtisanRepository();
    repo.seed({ id: 1 });
    await expect(updateProfile(repo, A, { iban: "FR00 0000" })).rejects.toBeInstanceOf(ValidationError);
    const maj = await updateProfile(repo, A, { iban: "FR7630006000011234567890189" }); // IBAN FR valide (clé 89)
    expect(maj.iban).toBe("FR7630006000011234567890189");
  });

  it("updateProfile : slug normalisé + unicité (ConflictError si pris par un autre tenant)", async () => {
    const repo = new FakeArtisanRepository();
    repo.seed({ id: 1 });
    repo.seed({ id: 2, slug: "plomberie-pro" }); // un autre tenant a déjà ce slug
    // slug normalisé (accents/casse/espaces)
    const maj = await updateProfile(repo, A, { slug: "Élec Pro 75" });
    expect(maj.slug).toBe("elec-pro-75");
    // collision → 409
    await expect(updateProfile(repo, A, { slug: "Plomberie PRO" })).rejects.toBeInstanceOf(ConflictError);
    // slug vide après normalisation → 400
    await expect(updateProfile(repo, A, { slug: "@@@" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("updateProfile : metier trimé (vide → null)", async () => {
    const repo = new FakeArtisanRepository();
    repo.seed({ id: 1 });
    expect((await updateProfile(repo, A, { metier: "  Plombier  " })).metier).toBe("Plombier");
    expect((await updateProfile(repo, A, { metier: "   " })).metier).toBeNull();
  });
});
