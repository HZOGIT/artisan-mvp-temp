import { describe, it, expect } from "vitest";
import * as stocksPublic from "./index";

// Contrat public du module (barrel) : le factory d'assemblage est exposé. Les types de
// domaine/ports sont effacés à la compilation ; on vérifie le factory (valeur runtime) et
// surtout qu'aucune impl d'infra (Drizzle/fake) ne fuite par le barrel public.
describe("stocks — barrel (contrat public)", () => {
  it("expose le factory createStocksModule", () => {
    expect(typeof stocksPublic.createStocksModule).toBe("function");
  });

  it("ne fuite pas l'infra (Drizzle/fake) depuis le contrat public", () => {
    expect("StockRepositoryDrizzle" in stocksPublic).toBe(false);
    expect("FakeStockRepository" in stocksPublic).toBe(false);
  });
});
