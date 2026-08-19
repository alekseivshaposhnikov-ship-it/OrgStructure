/**
 * test-utils.js
 * Общие моки для тестов экспорта SVG → PDF в jsdom.
 * Используется pdf-d3-export.test.js и export/pdf-utils.test.js.
 */
import { vi } from "vitest";

let restores = [];

/**
 * Устанавливает моки браузерных API, задействованных в конвейере
 * «SVG → canvas → PNG → jsPDF».
 *
 * ВАЖНО: `document.createElementNS` мокается прямой мутацией метода
 * (vi.stubGlobal не поддерживает вложенные пути вида "document.x").
 */
export function installSvgToPdfMocks() {
  const originalCreateElementNS = document.createElementNS.bind(document);
  document.createElementNS = (ns, tag) => {
    const el = {
      tagName: tag,
      namespaceURI: ns,
      attributes: {},
      children: [],
      parentNode: null,
      viewBox: { baseVal: { width: 0, height: 0 } },
      setAttribute(key, value) {
        el.attributes[key] = String(value);
        if (key === "width") el.viewBox.baseVal.width = Number(value);
        if (key === "height") el.viewBox.baseVal.height = Number(value);
      },
      appendChild(child) {
        el.children.push(child);
      },
      textContent: "",
    };
    return el;
  };
  restores.push(() => {
    document.createElementNS = originalCreateElementNS;
  });

  vi.stubGlobal(
    "XMLSerializer",
    class {
      serializeToString() {
        return "<svg></svg>";
      }
    },
  );

  vi.stubGlobal(
    "Blob",
    class {
      constructor(parts, opts) {
        this.parts = parts;
        this.opts = opts;
      }
    },
  );

  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:test-url"),
    revokeObjectURL: vi.fn(),
  });

  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.crossOrigin = "";
      }

      set src(val) {
        setTimeout(() => {
          if (typeof this.onload === "function") this.onload();
        }, 0);
      }

      get src() {
        return "";
      }
    },
  );

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,test");

  restores.push(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  });
}

/** Восстанавливает моки, установленные installSvgToPdfMocks(). */
export function restoreSvgToPdfMocks() {
  restores.forEach((restore) => restore());
  restores = [];
  vi.unstubAllGlobals();
}
