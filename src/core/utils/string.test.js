import { describe, it, expect } from "vitest";
import { escapeHtml, normalizeProjects, formatDate, sanitizeFileName } from "./string.js";

describe("core/utils/string.js", () => {
  describe("escapeHtml", () => {
    it("должен экранировать спецсимволы HTML", () => {
      expect(escapeHtml('<a href="x">&\'</a>')).toBe(
        "&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;",
      );
    });

    it("должен возвращать пустую строку для null/undefined", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });
  });

  describe("normalizeProjects", () => {
    it("должен нормализовать список проектов", () => {
      expect(normalizeProjects("А;Б ;  В")).toBe("А; Б; В");
    });

    it("должен возвращать пустую строку для пустого значения", () => {
      expect(normalizeProjects("")).toBe("");
      expect(normalizeProjects(null)).toBe("");
    });
  });

  describe("formatDate", () => {
    it("должен форматировать строку YYYY-MM-DD", () => {
      expect(formatDate("2026-07-10")).toBe("10.07.2026");
    });

    it("должен форматировать объект Date", () => {
      expect(formatDate(new Date(2026, 6, 10))).toBe("10.07.2026");
    });

    it("должен возвращать пустую строку для пустого значения", () => {
      expect(formatDate("")).toBe("");
      expect(formatDate(null)).toBe("");
    });
  });

  describe("sanitizeFileName", () => {
    it("должен заменять недопустимые символы", () => {
      expect(sanitizeFileName("a/b\\c:d*e?f\"g<h>i|")).toBe(
        "a_b_c_d_e_f_g_h_i_",
      );
    });

    it("должен использовать fallback для пустого значения", () => {
      expect(sanitizeFileName("")).toBe("orgchart");
      expect(sanitizeFileName(null)).toBe("orgchart");
    });

    it("должен ограничивать длину 120 символами", () => {
      const long = "x".repeat(200);
      expect(sanitizeFileName(long).length).toBe(120);
    });
  });
});
