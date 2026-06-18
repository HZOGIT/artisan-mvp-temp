import { describe, it, expect } from "vitest";
import {
  clampThreadsLimit,
  clampMessagesLimit,
  THREADS_LIMIT_DEFAUT,
  THREADS_LIMIT_MAX,
  MESSAGES_LIMIT_DEFAUT,
  MESSAGES_LIMIT_MAX,
} from "./assistant";

// Bornage des limites de pagination de l'assistant (anti-abus). Comportement : undefined / 0 / NaN
// → défaut ; valeur < min → min ; > max → max ; décimale → plancher.
describe("clampThreadsLimit", () => {
  it("undefined → défaut", () => {
    expect(clampThreadsLimit(undefined)).toBe(THREADS_LIMIT_DEFAUT);
  });
  it("valeur dans la plage → plancher de la valeur", () => {
    expect(clampThreadsLimit(50)).toBe(50);
    expect(clampThreadsLimit(5.9)).toBe(5);
  });
  it("au-dessus du max → max", () => {
    expect(clampThreadsLimit(1000)).toBe(THREADS_LIMIT_MAX);
  });
  it("0 → défaut (0 falsy) ; négatif → min 1", () => {
    expect(clampThreadsLimit(0)).toBe(THREADS_LIMIT_DEFAUT);
    expect(clampThreadsLimit(-5)).toBe(1);
  });
});

describe("clampMessagesLimit", () => {
  it("undefined → défaut ; > max → max", () => {
    expect(clampMessagesLimit(undefined)).toBe(MESSAGES_LIMIT_DEFAUT);
    expect(clampMessagesLimit(99999)).toBe(MESSAGES_LIMIT_MAX);
  });
  it("valeur valide conservée (plancher) ; négatif → min 1", () => {
    expect(clampMessagesLimit(250)).toBe(250);
    expect(clampMessagesLimit(-1)).toBe(1);
  });
});
