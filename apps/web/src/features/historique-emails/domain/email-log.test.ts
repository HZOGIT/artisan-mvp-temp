import { describe, expect, it } from "vitest";
import { emailStatutKind, filterByStatut, STATUT_FILTRES, type EmailLog } from "./email-log";

const mk = (p: Partial<EmailLog> & { id: number; statut: string }): EmailLog =>
  ({ destinataire: "", sujet: "", type: null, erreur: null, createdAt: "2026-01-01", ...p } as unknown as EmailLog);

describe("emailStatutKind", () => {
  it("envoye / echec / simule reconnus, sinon other", () => {
    expect(emailStatutKind("envoye")).toBe("envoye");
    expect(emailStatutKind("echec")).toBe("echec");
    expect(emailStatutKind("simule")).toBe("simule");
    expect(emailStatutKind("queued")).toBe("other");
  });
});

describe("STATUT_FILTRES", () => {
  it("expose les 4 filtres dans l'ordre", () => {
    expect(STATUT_FILTRES).toEqual(["tous", "envoye", "echec", "simule"]);
  });
});

describe("filterByStatut", () => {
  const rows = [
    mk({ id: 1, statut: "envoye" }),
    mk({ id: 2, statut: "echec" }),
    mk({ id: 3, statut: "simule" }),
    mk({ id: 4, statut: "envoye" }),
  ];
  it("'tous' ne filtre rien", () => {
    expect(filterByStatut(rows, "tous")).toHaveLength(4);
  });
  it("filtre par statut exact", () => {
    expect(filterByStatut(rows, "envoye").map((r) => r.id)).toEqual([1, 4]);
    expect(filterByStatut(rows, "echec").map((r) => r.id)).toEqual([2]);
  });
});
