import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  savedFiles: [],
  lastInstance: null,
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(opts) {
      this.opts = opts;
      pdfMocks.lastInstance = this;
    }
    addImage() {}
    save(name) {
      pdfMocks.savedFiles.push(name);
    }
  },
}));

const { renderSvgToPdf, withExportBusyState } = await import('./pdf-utils.js');
const { installSvgToPdfMocks, restoreSvgToPdfMocks } = await import('../test-utils.js');

function makeSvg(width = 1000, height = 800) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  return svg;
}

describe('export/pdf-utils.js', () => {
  beforeEach(() => {
    pdfMocks.savedFiles.length = 0;
    pdfMocks.lastInstance = null;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    restoreSvgToPdfMocks();
  });

  describe('renderSvgToPdf', () => {
    it('должен сохранять PDF с суффиксом по умолчанию и auto-ориентацией', async () => {
      installSvgToPdfMocks();
      const svg = makeSvg(1000, 800);

      await renderSvgToPdf({ svg, fileName: 'report' });

      expect(pdfMocks.savedFiles).toEqual(['report.pdf']);
      expect(pdfMocks.lastInstance.opts.orientation).toBe('landscape');
    });

    it('должен определять portrait для высоких изображений', async () => {
      installSvgToPdfMocks();
      const svg = makeSvg(800, 1000);

      await renderSvgToPdf({ svg, fileName: 'portrait' });

      expect(pdfMocks.lastInstance.opts.orientation).toBe('portrait');
    });

    it('должен поддерживать явную ориентацию и суффикс (компактный A4)', async () => {
      installSvgToPdfMocks();
      const svg = makeSvg(1122, 794);

      await renderSvgToPdf({
        svg,
        fileName: 'company',
        orientation: 'landscape',
        fileNameSuffix: '_compact_A4.pdf',
      });

      expect(pdfMocks.savedFiles).toEqual(['company_compact_A4.pdf']);
      expect(pdfMocks.lastInstance.opts.orientation).toBe('landscape');
    });

    it('должен отдавать URL-объект после завершения', async () => {
      installSvgToPdfMocks();
      const svg = makeSvg(100, 100);

      await renderSvgToPdf({ svg, fileName: 'x' });

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });
  });

  describe('withExportBusyState', () => {
    it('должен блокировать кнопку и восстанавливать её текст', async () => {
      document.body.innerHTML = '<button id="exportPdf">📄 Экспорт в PDF</button>';
      const task = vi.fn(async () => {});

      await withExportBusyState({ task });

      const button = document.getElementById('exportPdf');
      expect(task).toHaveBeenCalledTimes(1);
      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('📄 Экспорт в PDF');
    });

    it('должен показывать alert при ошибке и восстанавливать кнопку', async () => {
      vi.stubGlobal('alert', vi.fn());
      document.body.innerHTML = '<button id="exportPdf">Экспорт</button>';

      await withExportBusyState({
        task: async () => {
          throw new Error('boom');
        },
      });

      const button = document.getElementById('exportPdf');
      expect(alert).toHaveBeenCalledWith(expect.stringContaining('boom'));
      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('Экспорт');
    });
  });
});
