import { describe, it, expect } from "vitest";
import {
  COLORS,
  SCENARIO_LABELS,
  getScenarioLabel,
  getScenarioColors,
} from "./tokens.js";

describe("rendering/tokens.js", () => {
  it("должен содержать базовые цвета", () => {
    expect(COLORS.blue).toBe("#155eef");
    expect(COLORS.text).toBe("#101828");
    expect(COLORS.white).toBe("#ffffff");
  });

  it("SCENARIO_LABELS должен содержать все состояния", () => {
    expect(SCENARIO_LABELS.added).toBe("NEW");
    expect(SCENARIO_LABELS.changed).toBe("Изменен");
    expect(SCENARIO_LABELS.moved).toBe("Перемещен");
    expect(SCENARIO_LABELS.removed).toBe("Удален");
  });

  it("getScenarioLabel должен возвращать подписи и fallback", () => {
    expect(getScenarioLabel("added")).toBe("NEW");
    expect(getScenarioLabel("changed")).toBe("Изменен");
    expect(getScenarioLabel("unknown")).toBe("");
    expect(getScenarioLabel(undefined)).toBe("");
  });

  it("getScenarioColors должен возвращать цвета состояния", () => {
    expect(getScenarioColors("added")).toEqual({
      bg: COLORS.addedBg,
      text: COLORS.addedText,
    });
    expect(getScenarioColors("removed")).toEqual({
      bg: COLORS.removedBg,
      text: COLORS.removedText,
    });
    expect(getScenarioColors("unknown")).toEqual({
      bg: "#f2f4f7",
      text: "#344054",
    });
  });
});
