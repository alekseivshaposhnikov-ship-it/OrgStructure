import { describe, it, expect } from 'vitest';
import {
  buildCompactA4LayoutResult,
  unifiedLayoutToCompactFlat,
  A4_WIDTH,
  A4_HEIGHT,
} from './compact-a4-layout.js';

function makeApiNode(overrides = {}) {
  return {
    department_guid: overrides.id || 'root',
    department_name: overrides.name || 'Холдинг',
    department_manager: overrides.manager || 'Директор',
    department_manager_position: overrides.managerPosition || 'CEO',
    staffCount: overrides.staffCount ?? 10,
    vacancyCount: overrides.vacancyCount ?? 0,
    totalWithVacancies: overrides.totalWithVacancies ?? 10,
    users: overrides.users || [],
    children: overrides.children || [],
  };
}

describe('compact-a4-layout (единый layout)', () => {
  describe('buildCompactA4LayoutResult', () => {
    it('должен вернуть null для null-входа', () => {
      expect(buildCompactA4LayoutResult(null)).toBeNull();
    });

    it('должен строить результат на основе computeUnifiedLayout', () => {
      const result = buildCompactA4LayoutResult(makeApiNode());

      expect(result).not.toBeNull();
      expect(result.a4Width).toBe(A4_WIDTH);
      expect(result.a4Height).toBe(A4_HEIGHT);
      expect(result.layout).toBeDefined();
      expect(result.canFit).toBe(true);
      expect(result.scale).toBeGreaterThan(0);
      expect(result.scale).toBeLessThanOrEqual(1);
      expect(result.flat.length).toBeGreaterThan(0);
    });

    it('должен включать сотрудников в колонку employees', () => {
      const root = makeApiNode({
        users: [
          {
            id: 'u1',
            name: 'Иван',
            position: 'Разработчик',
            isVacancy: false,
            project: '',
            subLevel: 1,
          },
        ],
      });

      const result = buildCompactA4LayoutResult(root);
      const employees = result.flat.find((n) => n.type === 'employees');

      expect(employees).toBeDefined();
      expect(employees.persons).toHaveLength(1);
      expect(employees.persons[0].name).toBe('Иван');
      expect(employees.persons[0].type).toBe('employee');
    });

    it('должен исключать вакансии при showVacancies=false', () => {
      const root = makeApiNode({
        users: [
          {
            id: 'v1',
            name: 'Вакансия',
            position: 'Тестировщик',
            isVacancy: true,
            project: '',
          },
        ],
      });

      const result = buildCompactA4LayoutResult(root, { showVacancies: false });
      const employees = result.flat.find((n) => n.type === 'employees');

      expect(employees).toBeUndefined();
    });
  });

  describe('unifiedLayoutToCompactFlat', () => {
    function buildFlat(overrides = {}, options = {}) {
      const result = buildCompactA4LayoutResult(makeApiNode(overrides), options);
      return unifiedLayoutToCompactFlat(result.layout, {
        hideNames: options.hideNames || false,
        showVacancies: options.showVacancies ?? true,
      });
    }

    it('должен маппить подразделения с parentId', () => {
      const flat = buildFlat({
        children: [makeApiNode({ id: 'child', name: 'Отдел' })],
      });

      const child = flat.find((n) => n.id === 'child');
      expect(child).toBeDefined();
      expect(child.type).toBe('department');
      expect(child.parentId).toBe('root');
      expect(child.cardWidth).toBeGreaterThan(0);
      expect(child.cardHeight).toBeGreaterThan(0);
    });

    it('должен скрывать имена при hideNames=true', () => {
      const flat = buildFlat({}, { hideNames: true });

      const root = flat.find((n) => n.id === 'root');
      expect(root.manager).toBe('');
    });

    it('должен маппить вакансию как type=vacancy', () => {
      const flat = buildFlat({
        users: [
          {
            id: 'v1',
            name: 'Вакансия',
            position: 'Тестировщик',
            isVacancy: true,
            project: '',
          },
        ],
      });

      const employees = flat.find((n) => n.type === 'employees');
      expect(employees.persons[0].type).toBe('vacancy');
      expect(employees.persons[0].name).toBe('Вакансия');
    });
  });
});
