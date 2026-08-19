import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installSvgToPdfMocks, restoreSvgToPdfMocks } from '../test-utils.js';

const { exportOrgChartToPdf, exportCompactA4ToPdf } = await import('./pdf-d3-export.js');

describe('pdf-d3-export.js', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    document.body.innerHTML = '';
  });

  afterEach(() => {
    restoreSvgToPdfMocks();
  });

  function makeRoot() {
    return {
      department_guid: 'root',
      department_name: 'Холдинг',
      staffCount: 5,
      vacancyCount: 1,
      totalWithVacancies: 6,
      children: [],
      users: [],
    };
  }

  describe('exportOrgChartToPdf', () => {
    it('должен вызывать alert при пустом rootNodes', async () => {
      await exportOrgChartToPdf({ rootNodes: [] });

      expect(alert).toHaveBeenCalledWith('Нет диаграммы для экспорта');
    });

    it('должен корректно обрабатывать данные с одним корнем', async () => {
      installSvgToPdfMocks();

      await expect(
        exportOrgChartToPdf({
          rootNodes: [makeRoot()],
          title: 'Тест',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('exportCompactA4ToPdf', () => {
    it('должен вызывать alert при пустом rootNodes', async () => {
      await exportCompactA4ToPdf({ rootNodes: [] });

      expect(alert).toHaveBeenCalledWith('Нет диаграммы для экспорта');
    });

    it('должен обрабатывать данные с одним корнем (компактный путь)', async () => {
      installSvgToPdfMocks();

      await expect(
        exportCompactA4ToPdf({
          rootNodes: [makeRoot()],
          title: 'Тест',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
