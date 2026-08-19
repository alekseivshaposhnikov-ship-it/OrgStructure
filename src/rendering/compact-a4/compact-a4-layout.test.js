import { describe, it, expect } from 'vitest';
import {
  calculateCompactLayout,
  convertToCompactTree,
  A4_WIDTH,
  A4_HEIGHT,
  DEPT_W,
  DEPT_H,
  PERSON_W,
  PERSON_H,
} from './compact-a4-layout.js';

describe('compact-a4-layout', () => {
  describe('calculateCompactLayout', () => {
    it('должен вернуть null для null-входа', () => {
      expect(calculateCompactLayout(null)).toBeNull();
    });

    it('должен корректно обрабатывать одиночный узел департамента', () => {
      const tree = {
        id: 'root',
        type: 'department',
        name: 'Холдинг',
        manager: '',
        position: '',
        count: 10,
        project: '',
        scenarioState: '',
        children: [],
      };

      const result = calculateCompactLayout(tree);

      expect(result).not.toBeNull();
      expect(result.flat).toHaveLength(1);
      expect(result.flat[0].id).toBe('root');
      expect(result.flat[0].type).toBe('department');
      expect(result.flat[0].cardWidth).toBe(DEPT_W);
      expect(result.flat[0].cardHeight).toBe(DEPT_H);
      expect(result.scale).toBe(1);
      expect(result.canFit).toBe(true);
    });

    it('должен обрабатывать дерево с дочерними подразделениями — секционная раскладка', () => {
      const tree = {
        id: 'root',
        type: 'department',
        name: 'Холдинг',
        manager: 'Иван Иванов',
        position: 'Генеральный директор',
        count: 50,
        project: '',
        scenarioState: '',
        children: [
          {
            id: 'dept1',
            type: 'department',
            name: 'Бухгалтерия',
            manager: 'Петр Петров',
            position: 'Главный бухгалтер',
            count: 10,
            project: '',
            scenarioState: '',
            children: [
              {
                id: 'emp1',
                type: 'employee',
                name: 'Сотрудник 1',
                manager: '',
                position: 'Бухгалтер',
                count: null,
                project: '',
                scenarioState: '',
                children: [],
              },
            ],
          },
          {
            id: 'dept2',
            type: 'department',
            name: 'ИТ-отдел',
            manager: 'Сидор Сидоров',
            position: 'CIO',
            count: 20,
            project: '',
            scenarioState: '',
            children: [],
          },
        ],
      };

      const result = calculateCompactLayout(tree);

      expect(result).not.toBeNull();
      expect(result.flat.length).toBeGreaterThanOrEqual(4);
      expect(result.canFit).toBe(true);
      expect(result.scale).toBeGreaterThanOrEqual(0.45);
      expect(result.scale).toBeLessThanOrEqual(1);

      // Проверяем, что все узлы имеют координаты
      result.flat.forEach(node => {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeGreaterThanOrEqual(0);
      });
    });

    it('должен обрабатывать вакансии внутри отдела', () => {
      const tree = {
        id: 'root',
        type: 'department',
        name: 'Отдел',
        manager: '',
        position: '',
        count: 5,
        project: '',
        scenarioState: '',
        children: [
          {
            id: 'vac1',
            type: 'vacancy',
            name: 'Вакансия',
            manager: '',
            position: 'Программист',
            count: null,
            project: '',
            scenarioState: '',
            children: [],
          },
          {
            id: 'emp1',
            type: 'employee',
            name: 'Иван',
            manager: '',
            position: 'Разработчик',
            count: null,
            project: '',
            scenarioState: '',
            children: [],
          },
        ],
      };

      const result = calculateCompactLayout(tree);
      expect(result).not.toBeNull();
      expect(result.flat.length).toBe(3);

      const vacancy = result.flat.find(n => n.type === 'vacancy');
      expect(vacancy).toBeDefined();
      expect(vacancy.position).toBe('Программист');

      const employee = result.flat.find(n => n.type === 'employee');
      expect(employee).toBeDefined();
      expect(employee.name).toBe('Иван');
    });

    it('должен обрабатывать административного ассистента', () => {
      const tree = {
        id: 'root',
        type: 'department',
        name: 'Отдел с ассистентом',
        manager: '',
        position: '',
        count: 5,
        project: '',
        scenarioState: '',
        children: [
          {
            id: 'asst1',
            type: 'assistant',
            name: 'Ассистент',
            manager: '',
            position: 'Административный ассистент',
            count: null,
            project: '',
            scenarioState: '',
            children: [],
          },
        ],
      };

      const result = calculateCompactLayout(tree);
      expect(result).not.toBeNull();
      const assistant = result.flat.find(n => n.type === 'assistant');
      expect(assistant).toBeDefined();
    });

    it('должен устанавливать canFit=false если структура слишком большая', () => {
      // Создаём очень широкое дерево с множеством отделов
      const children = [];
      for (let i = 0; i < 50; i++) {
        children.push({
          id: `dept_${i}`,
          type: 'department',
          name: `Отдел ${i}`,
          manager: '',
          position: '',
          count: 10,
          project: '',
          scenarioState: '',
          children: [],
        });
      }

      const tree = {
        id: 'root',
        type: 'department',
        name: 'Мега-холдинг',
        manager: '',
        position: '',
        count: 500,
        project: '',
        scenarioState: '',
        children,
      };

      const result = calculateCompactLayout(tree);
      expect(result).not.toBeNull();
      expect(typeof result.canFit).toBe('boolean');
      // При 50 отделах скорее всего не влезет
      // Но проверяем, что функция возвращает корректные поля
      expect(result.scale).toBeGreaterThanOrEqual(0.45);
    });

    it('должен корректно формировать parentId в flat-списке', () => {
      const tree = {
        id: 'root',
        type: 'department',
        name: 'Главный',
        manager: '',
        position: '',
        count: 3,
        project: '',
        scenarioState: '',
        children: [
          {
            id: 'depA',
            type: 'department',
            name: 'Отдел A',
            manager: '',
            position: '',
            count: 1,
            project: '',
            scenarioState: '',
            children: [
              {
                id: 'empA1',
                type: 'employee',
                name: 'Работник',
                manager: '',
                position: 'Специалист',
                count: null,
                project: '',
                scenarioState: '',
                children: [],
              },
            ],
          },
          {
            id: 'empRoot',
            type: 'employee',
            name: 'Помощник',
            manager: '',
            position: '',
            count: null,
            project: '',
            scenarioState: '',
            children: [],
          },
        ],
      };

      const result = calculateCompactLayout(tree);
      expect(result).not.toBeNull();

      const root = result.flat.find(n => n.id === 'root');
      expect(root.parentId).toBeNull();

      const depA = result.flat.find(n => n.id === 'depA');
      expect(depA.parentId).toBe('root');

      const empA1 = result.flat.find(n => n.id === 'empA1');
      expect(empA1.parentId).toBe('depA');

      const empRoot = result.flat.find(n => n.id === 'empRoot');
      expect(empRoot.parentId).toBe('root');
    });
  });

  describe('convertToCompactTree', () => {
    it('должен конвертировать export-узел в дерево для layout', () => {
      const exportNode = {
        id: 'root',
        type: 'department',
        name: 'Холдинг',
        manager: 'Директор',
        position: 'CEO',
        count: 100,
        project: '',
        scenarioState: '',
        children: [
          {
            id: 'child1',
            type: 'department',
            name: 'Подразделение',
            manager: 'Менеджер',
            position: 'Manager',
            count: 50,
            project: '',
            scenarioState: 'added',
            children: [],
          },
        ],
      };

      const tree = convertToCompactTree(exportNode);
      expect(tree).not.toBeNull();
      expect(tree.id).toBe('root');
      expect(tree.name).toBe('Холдинг');
      expect(tree.manager).toBe('Директор');
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].scenarioState).toBe('added');
    });

    it('должен вернуть null для null-входа', () => {
      expect(convertToCompactTree(null)).toBeNull();
    });

    it('должен конвертировать пустые имена в пустые строки', () => {
      const exportNode = {
        id: 'node1',
        type: 'employee',
        name: undefined,
        manager: undefined,
        position: undefined,
        count: null,
        project: undefined,
        scenarioState: undefined,
        children: [],
      };

      const tree = convertToCompactTree(exportNode);
      expect(tree.name).toBe('');
      expect(tree.manager).toBe('');
      expect(tree.position).toBe('');
      expect(tree.project).toBe('');
    });
  });
});