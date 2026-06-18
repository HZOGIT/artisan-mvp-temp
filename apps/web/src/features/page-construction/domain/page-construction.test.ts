import { describe, expect, it } from "vitest";
import { titleKeyForPath } from "./page-construction";

describe("page-construction — domain pur", () => {
  it("titleKeyForPath : mappe contact/aide/guide", () => {
    expect(titleKeyForPath("/contact")).toBe("titreContact");
    expect(titleKeyForPath("/aide")).toBe("titreAide");
    expect(titleKeyForPath("/guide")).toBe("titreGuide");
    expect(titleKeyForPath("/inconnu")).toBe("titrePage");
  });
});
