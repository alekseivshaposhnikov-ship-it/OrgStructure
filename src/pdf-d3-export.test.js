import { describe, it, expect, vi } from 'vitest';

const { exportOrgChartToPdf } = await import('./pdf-d3-export.js');

describe('pdf-d3-export.js', () => {
  describe('exportOrgChartToPdf', () => {
    it('должен вызывать alert при пустом rootNodes', async () => {
      vi.stubGlobal('alert', vi.fn());

      await exportOrgChartToPdf({ rootNodes: [] });

      expect(alert).toHaveBeenCalledWith('Нет диаграммы для экспорта');
    });

    it('должен корректно обрабатывать данные с одним корнем', async () => {
      vi.stubGlobal('alert', vi.fn());

      // Мок для createElementNS — возвращаем SVG-элементы
      const svgElements = [];
      vi.stubGlobal('document.createElementNS', (ns, tag) => {
        const el = {
          tagName: tag,
          namespaceURI: ns,
          attributes: {},
          children: [],
          parentNode: null,
          viewBox: { baseVal: { width: 0, height: 0 } },
          setAttribute(key, value) {
            el.attributes[key] = String(value);
            if (key === 'width') el.viewBox.baseVal.width = Number(value);
            if (key === 'height') el.viewBox.baseVal.height = Number(value);
          },
          appendChild(child) {
            el.children.push(child);
          },
          textContent: '',
        };
        svgElements.push(el);
        return el;
      });

      // Мок XMLSerializer
      class MockXMLSerializer {
        serializeToString() {
          return '<svg></svg>';
        }
      }
      vi.stubGlobal('XMLSerializer', MockXMLSerializer);

      vi.stubGlobal('Blob', class MockBlob {
        constructor(parts, opts) {
          this.parts = parts;
          this.opts = opts;
        }
      });

      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:test-url'),
        revokeObjectURL: vi.fn(),
      });

      // Мок Image
      class MockImage {
        constructor() {
          this.onload = null;
          this.onerror = null;
          this.crossOrigin = '';
        }
        set src(val) {
          // Асинхронно вызываем onload
          setTimeout(() => {
            if (typeof this.onload === 'function') this.onload();
          }, 0);
        }
        get src() { return ''; }
      }
      vi.stubGlobal('Image', MockImage);

      // Мок Canvas
      HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
      }));
      HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,test');

      document.body.innerHTML = '';

      await expect(
        exportOrgChartToPdf({
          rootNodes: [{
            department_guid: 'root',
            department_name: 'Холдинг',
            staffCount: 5,
            vacancyCount: 1,
            totalWithVacancies: 6,
            children: [],
            users: [],
          }],
          title: 'Тест',
        }),
      ).resolves.toBeUndefined();
    });
  });
});