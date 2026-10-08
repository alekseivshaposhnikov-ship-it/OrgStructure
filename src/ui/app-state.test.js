import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeCardDesign,
  createAppState,
  ALLOWED_CARD_DESIGNS,
} from "./app-state.js";

describe("app-state.js (CR-023)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("оставляет только два режима дизайна (Текущий, Группировка по должности)", () => {
    expect(ALLOWED_CARD_DESIGNS).toEqual(["classic", "grouped"]);
    expect(normalizeCardDesign("grouped")).toBe("grouped");
    expect(normalizeCardDesign("classic")).toBe("classic");
  });

  it("устаревшие значения дизайна приводятся к classic", () => {
    expect(normalizeCardDesign("variant2")).toBe("classic");
    expect(normalizeCardDesign("variant3")).toBe("classic");
    expect(normalizeCardDesign("compact-a4")).toBe("classic");
    expect(normalizeCardDesign(null)).toBe("classic");
    expect(normalizeCardDesign(undefined)).toBe("classic");
  });

  it("createAppState нормализует сохранённое значение", () => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => "compact-a4") });
    expect(createAppState().cardDesign).toBe("classic");

    vi.stubGlobal("localStorage", { getItem: vi.fn(() => "grouped") });
    expect(createAppState().cardDesign).toBe("grouped");
  });
});
