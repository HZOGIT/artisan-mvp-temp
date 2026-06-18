import { describe, expect, it } from "vitest";
import { avisStatutKind, distributionPercent, nextModerationStatut, canReply, type Avis } from "./avis";

describe("avisStatutKind", () => {
  it("publie / masque / en_attente reconnus, sinon other", () => {
    expect(avisStatutKind("publie")).toBe("publie");
    expect(avisStatutKind("masque")).toBe("masque");
    expect(avisStatutKind("en_attente")).toBe("en_attente");
    expect(avisStatutKind("zzz")).toBe("other");
    expect(avisStatutKind(null)).toBe("other");
  });
});

describe("distributionPercent", () => {
  it("count / total × 100, 0 si total nul", () => {
    expect(distributionPercent(3, 12)).toBe(25);
    expect(distributionPercent(0, 0)).toBe(0);
    expect(distributionPercent(5, 0)).toBe(0);
  });
});

describe("nextModerationStatut", () => {
  it("toggle publié → masqué, sinon → publié", () => {
    expect(nextModerationStatut("publie")).toBe("masque");
    expect(nextModerationStatut("masque")).toBe("publie");
    expect(nextModerationStatut("en_attente")).toBe("publie");
    expect(nextModerationStatut(null)).toBe("publie");
  });
});

describe("canReply", () => {
  it("vrai seulement sans réponse artisan", () => {
    expect(canReply({ reponseArtisan: null } as Pick<Avis, "reponseArtisan">)).toBe(true);
    expect(canReply({ reponseArtisan: "Merci !" } as Pick<Avis, "reponseArtisan">)).toBe(false);
  });
});
