import { describe, it, expect } from "vitest";
import { detectDeviceType, detectBrowser, detectOS, generateFingerprint } from "./device";

describe("detection device (parité legacy)", () => {
  it("detectDeviceType : desktop / mobile / tablet", () => {
    expect(detectDeviceType("Mozilla/5.0 (Windows NT 10.0) Chrome/120")).toBe("desktop");
    expect(detectDeviceType("iPhone Mobile Safari")).toBe("mobile");
    expect(detectDeviceType("iPad Safari")).toBe("tablet");
    expect(detectDeviceType("Android Tablet")).toBe("tablet");
    expect(detectDeviceType("Linux; Android 13; Pixel Mobile")).toBe("mobile");
    expect(detectDeviceType("")).toBe("desktop");
  });

  it("detectBrowser : ordre Edge>Opera>Firefox>Chrome>Safari", () => {
    expect(detectBrowser("Edg/120 Chrome/120")).toBe("Edge");
    expect(detectBrowser("Chrome/120 Safari/537")).toBe("Chrome");
    expect(detectBrowser("Safari/537")).toBe("Safari");
    expect(detectBrowser("Firefox/120")).toBe("Firefox");
  });

  it("detectOS : Windows/iOS/Android/macOS/Linux", () => {
    expect(detectOS("Windows NT 10.0")).toBe("Windows");
    expect(detectOS("iPhone OS")).toBe("iOS");
    expect(detectOS("Mac OS X")).toBe("macOS");
    expect(detectOS("X11; Linux")).toBe("Linux");
  });

  it("generateFingerprint : déterministe, 32 car. hex, sensible OS+browser+type", () => {
    const fp = generateFingerprint("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537");
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
    expect(generateFingerprint("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe(fp); // stable
    // même OS+browser mais type différent → empreinte différente
    expect(generateFingerprint("iPhone Mobile Chrome/120 Safari/537")).not.toBe(fp);
  });
});
