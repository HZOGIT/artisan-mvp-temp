import { describe, expect, it } from "vitest";
import { titleKeyForPath } from "./page-construction";

describe("page-construction — domain pur", () => {
  it("titleKeyForPath : mappe contact/aide/guide (tolère /v2)", () => {
    expect(titleKeyForPath("/contact")).toBe("titreContact");
    expect(titleKeyForPath("/v2/aide")).toBe("titreAide");
    expect(titleKeyForPath("/v2/guide")).toBe("titreGuide");
    expect(titleKeyForPath("/inconnu")).toBe("titrePage");
  });
});
