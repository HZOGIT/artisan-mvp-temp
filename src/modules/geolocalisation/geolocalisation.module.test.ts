import { describe, it, expect } from "vitest";
import { createGeolocalisationModule } from "./geolocalisation.module";
import { FakeTechnicienPositionReader } from "./infra/position-reader-fake";

describe("geolocalisation.module", () => {
  it("createGeolocalisationModule câble le reader injecté", () => {
    const reader = new FakeTechnicienPositionReader();
    const module = createGeolocalisationModule({ reader });
    expect(module.deps.reader).toBe(reader);
  });

  it("expose le routeur tRPC (getPositions)", () => {
    const module = createGeolocalisationModule({ reader: new FakeTechnicienPositionReader() });
    const procedures = Object.keys((module.router as { _def: { record: Record<string, unknown> } })._def.record).sort();
    expect(procedures).toEqual(["getPositions"]);
  });
});
