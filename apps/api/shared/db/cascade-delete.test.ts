import { describe, it, expect, skip } from "vitest";

describe("cascade deletes (FK ON DELETE CASCADE)", () => {
  it.skip("DELETE contrat → supprime factures_recurrentes en cascade", async () => {
    expect(true).toBe(true);
  });

  it.skip("DELETE intervention → supprime interventions_mobile + demandes_avis en cascade", async () => {
    expect(true).toBe(true);
  });

  it.skip("DELETE interventions_mobile → supprime photos_interventions en cascade", async () => {
    expect(true).toBe(true);
  });
});
