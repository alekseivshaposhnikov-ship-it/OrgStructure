import { describe, it, expect } from "vitest";
import { VIEW_MODE_TITLES } from "./constants.js";

describe("core/constants.js", () => {
  it("должен содержать названия всех режимов отображения", () => {
    expect(VIEW_MODE_TITLES["as-is"]).toBe("Текущая структура");
    expect(VIEW_MODE_TITLES["to-be"]).toBe("Целевая структура");
    expect(VIEW_MODE_TITLES.changes).toBe("Изменения");
  });
});
