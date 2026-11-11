import { describe, expect, it } from "vitest";
import { analyse, meanCi, susLabel, susScore } from "../../tools/eval/utilisabilite.js";

describe("dépouillement SUS", () => {
  it("score de Brooke : bornes et cas neutre", () => {
    expect(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    expect(susScore([4, 2, 4, 2, 4, 1, 4, 2, 4, 2])).toBe(77.5);
  });

  it("refuse une réponse hors échelle ou incomplète", () => {
    expect(() => susScore([6, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toThrow();
    expect(() => susScore([3, 3, 3])).toThrow();
  });

  it("intervalle de confiance borné à [0 ; 100] et lecture de Bangor", () => {
    const ci = meanCi([95, 100, 60]);
    expect(ci.high).toBeLessThanOrEqual(100);
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(susLabel(68)).toBe("bon");
    expect(susLabel(85)).toBe("excellent");
  });

  it("réussite et temps médian par tâche", () => {
    const a = analyse(
      [{ participant: "P1", role: "RSSI", answers: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] }],
      [
        { participant: "P1", role: "RSSI", task: "1", success: 1, seconds: 30, errors: 0 },
        { participant: "P2", role: "DPO", task: "1", success: 0.5, seconds: 90, errors: 2 },
      ],
    );
    expect(a.perTask[0]).toMatchObject({ task: "1", n: 2, success: 0.75, medianSeconds: 60, meanErrors: 1 });
  });
});
