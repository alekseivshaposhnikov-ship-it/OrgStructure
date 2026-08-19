import { describe, it, expect, beforeEach } from "vitest";
import { createSvgElement, appendText, addText, truncateText } from "./svg-utils.js";

describe("rendering/svg-utils.js", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("createSvgElement должен создавать элемент с атрибутами", () => {
    const el = createSvgElement("rect", { x: 1, y: 2, fill: "#fff" });

    expect(el.tagName).toBe("rect");
    expect(el.getAttribute("x")).toBe("1");
    expect(el.getAttribute("fill")).toBe("#fff");
  });

  it("appendText должен добавлять text-элемент в группу", () => {
    const g = createSvgElement("g");
    appendText(g, "Привет", { x: 10, y: 20 });

    const text = g.querySelector("text");
    expect(text).toBeTruthy();
    expect(text.textContent).toBe("Привет");
    expect(text.getAttribute("x")).toBe("10");
    expect(text.getAttribute("y")).toBe("20");
  });

  it("appendText должен поддерживать стилизацию", () => {
    const g = createSvgElement("g");
    appendText(g, "T", { x: 0, y: 0, size: 14, weight: 700, fill: "#f00", anchor: "middle" });

    const text = g.querySelector("text");
    expect(text.getAttribute("font-size")).toBe("14");
    expect(text.getAttribute("font-weight")).toBe("700");
    expect(text.getAttribute("fill")).toBe("#f00");
    expect(text.getAttribute("text-anchor")).toBe("middle");
  });

  it("addText должен работать с позиционной сигнатурой", () => {
    const g = createSvgElement("g");
    addText(g, "Тест", 1, 2, 12, 700, "#000");

    const text = g.querySelector("text");
    expect(text.textContent).toBe("Тест");
    expect(text.getAttribute("font-size")).toBe("12");
  });

  it("truncateText должен обрезать с многоточием", () => {
    expect(truncateText("Короткий", 20)).toBe("Короткий");
    expect(truncateText("Длинный текст", 6)).toBe("Длинн…");
  });
});
