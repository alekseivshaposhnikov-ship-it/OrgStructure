import { describe, it, expect } from 'vitest';
import {
  createScenario,
  cloneTree,
  resetScenario,
  renameScenario,
  addDepartment,
  editDepartment,
  addEmployee,
  editEmployee,
  addVacancy,
  editVacancy,
  removeEmployee,
  removeVacancy,
  removeDepartment,
  moveEmployee,
  moveVacancy,
  moveDepartment,
  getTreeByViewMode,
  getScenarioStats,
  getDepartmentOptions,
  findDepartmentById,
  findUserById,
} from './scenario-manager.js';

function makeDepartment(overrides = {}) {
  return {
    department_guid: overrides.id || 'dept-1',
    department_name: overrides.name || 'Отдел',
    department_manager: overrides.manager || '',
    department_manager_position: overrides.managerPosition || '',
    parent_guid: overrides.parentId || null,
    staffCount: overrides.staffCount ?? 0,
    vacancyCount: overrides.vacancyCount ?? 0,
    totalWithVacancies: overrides.totalWithVacancies ?? 0,
    users: overrides.users || [],
    children: overrides.children || [],
    ...(overrides.extra || {}),
  };
}

function makeEmployee(overrides = {}) {
  return {
    id: overrides.id || 'emp-1',
    full_name: overrides.full_name || 'Иван Иванов',
    name: overrides.full_name || 'Иван Иванов',
    fullName: overrides.full_name || 'Иван Иванов',
    position: overrides.position || 'Разработчик',
    rawPosition: overrides.rawPosition || overrides.position || 'Разработчик',
    email: overrides.email || '',
    phone: overrides.phone || '',
    photo: '',
    project: overrides.project || '',
    typeEmployment: overrides.typeEmployment || '',
    state: overrides.state || '',
    subLevel: overrides.subLevel ?? Number.MAX_SAFE_INTEGER,
    isVacancy: overrides.isVacancy ?? false,
    scenarioState: overrides.scenarioState || '',
  };
}

function makeVacancy(overrides = {}) {
  return makeEmployee({
    id: overrides.id || 'vac-1',
    full_name: 'Вакансия',
    position: overrides.position || 'Новая вакансия',
    isVacancy: true,
    ...overrides,
  });
}

describe('scenario-manager', () => {
  let baseTree;

  beforeEach(() => {
    baseTree = [
      makeDepartment({
        id: 'dept-root',
        name: 'Холдинг',
        staffCount: 2,
        vacancyCount: 1,
        totalWithVacancies: 3,
        users: [makeEmployee({ id: 'emp-1', full_name: 'Иван Иванов', position: 'Директор', subLevel: 1 })],
        children: [
          makeDepartment({
            id: 'dept-sub',
            name: 'Подразделение',
            parentId: 'dept-root',
            staffCount: 1,
            vacancyCount: 1,
            totalWithVacancies: 2,
            users: [
              makeEmployee({ id: 'emp-2', full_name: 'Петр Петров', position: 'Руководитель', subLevel: 2 }),
              makeVacancy({ id: 'vac-1', position: 'Программист' }),
            ],
            children: [],
          }),
        ],
      }),
    ];
  });

  describe('cloneTree', () => {
    it('должен создавать глубокую копию', () => {
      const cloned = cloneTree(baseTree);
      expect(cloned).toEqual(baseTree);
      cloned[0].department_name = 'Изменено';
      expect(baseTree[0].department_name).toBe('Холдинг');
    });

    it('должен возвращать [] для null/undefined', () => {
      expect(cloneTree(null)).toEqual([]);
      expect(cloneTree(undefined)).toEqual([]);
    });
  });

  describe('createScenario', () => {
    it('должен создавать сценарий с клонированным деревом', () => {
      const scenario = createScenario(baseTree);
      expect(scenario.baseTree).toEqual(baseTree);
      expect(scenario.workingTree).toEqual(baseTree);
      scenario.workingTree[0].department_name = 'Изменено';
      expect(scenario.baseTree[0].department_name).toBe('Холдинг');
    });

    it('должен создавать сценарий с пустым списком операций', () => {
      const scenario = createScenario(baseTree);
      expect(scenario.operations).toEqual([]);
    });

    it('должен устанавливать имя по умолчанию', () => {
      const scenario = createScenario(baseTree);
      expect(scenario.name).toBe('Новый сценарий моделирования');
    });

    it('должен устанавливать baseDate', () => {
      const scenario = createScenario(baseTree);
      expect(scenario.baseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('resetScenario', () => {
    it('должен сбрасывать изменения', () => {
      const scenario = createScenario(baseTree);
      const changed = addDepartment(scenario, 'dept-sub', { department_name: 'Новый отдел' });
      const reset = resetScenario(changed);
      expect(reset.workingTree).toEqual(reset.baseTree);
      expect(reset.operations).toEqual([]);
    });
  });

  describe('renameScenario', () => {
    it('должен обновлять имя', () => {
      const scenario = createScenario(baseTree);
      const renamed = renameScenario(scenario, 'Новое имя');
      expect(renamed.name).toBe('Новое имя');
    });

    it('должен возвращать имя по умолчанию при пустой строке', () => {
      const scenario = createScenario(baseTree);
      const renamed = renameScenario(scenario, '   ');
      expect(renamed.name).toBe('Новый сценарий моделирования');
    });

    it('не должен мутировать исходный сценарий', () => {
      const scenario = createScenario(baseTree);
      renameScenario(scenario, 'Новое имя');
      expect(scenario.name).toBe('Новый сценарий моделирования');
    });
  });

  describe('addDepartment', () => {
    it('должен добавлять дочернее подразделение', () => {
      const scenario = createScenario(baseTree);
      const updated = addDepartment(scenario, 'dept-sub', { department_name: 'Новый отдел' });
      const parent = findDepartmentById(updated.workingTree, 'dept-sub');
      expect(parent.children.length).toBe(1);
      expect(parent.children[0].department_name).toBe('Новый отдел');
      expect(parent.children[0].scenarioState).toBe('added');
    });

    it('должен возвращать исходный сценарий, если parent не найден', () => {
      const scenario = createScenario(baseTree);
      const updated = addDepartment(scenario, 'non-existent', { department_name: 'Новый' });
      expect(updated).toBe(scenario);
    });

    it('должен пересчитывать численность после добавления', () => {
      const scenario = createScenario(baseTree);
      const updated = addDepartment(scenario, 'dept-root', { department_name: 'Подраздел' });
      const newRoot = findDepartmentById(updated.workingTree, 'dept-root');
      // После recalculateTree: 2 сотрудника + 0 сотрудников нового отдела = 2
      expect(newRoot.staffCount).toBe(2);
    });

    it('должен записывать операцию', () => {
      const scenario = createScenario(baseTree);
      const updated = addDepartment(scenario, 'dept-sub', { department_name: 'Новый отдел' });
      expect(updated.operations.length).toBe(1);
      expect(updated.operations[0].type).toBe('addDepartment');
    });
  });

  describe('editDepartment', () => {
    it('должен изменять название подразделения', () => {
      const scenario = createScenario(baseTree);
      const updated = editDepartment(scenario, 'dept-sub', { department_name: 'Измененный отдел' });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      expect(dept.department_name).toBe('Измененный отдел');
    });

    it('должен изменять руководителя', () => {
      const scenario = createScenario(baseTree);
      const updated = editDepartment(scenario, 'dept-sub', { department_manager: 'Новый руководитель' });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      expect(dept.department_manager).toBe('Новый руководитель');
    });

    it('должен устанавливать scenarioState="changed", если не "added"', () => {
      const scenario = createScenario(baseTree);
      const updated = editDepartment(scenario, 'dept-sub', { department_name: 'Изменен' });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      expect(dept.scenarioState).toBe('changed');
    });

    it('не должен менять scenarioState, если уже "added"', () => {
      const scenario = createScenario(baseTree);
      const withAdded = addDepartment(scenario, 'dept-sub', { department_name: 'Новый' });
      const addedDeptId = withAdded.operations[0].entityId;
      const updated = editDepartment(withAdded, addedDeptId, { department_name: 'Еще новее' });
      const dept = findDepartmentById(updated.workingTree, addedDeptId);
      expect(dept.scenarioState).toBe('added');
    });

    it('должен возвращать исходный сценарий, если отдел не найден', () => {
      const scenario = createScenario(baseTree);
      const updated = editDepartment(scenario, 'non-existent', { department_name: 'Новое' });
      expect(updated).toBe(scenario);
    });
  });

  describe('addEmployee', () => {
    it('должен добавлять сотрудника', () => {
      const scenario = createScenario(baseTree);
      const updated = addEmployee(scenario, 'dept-sub', {
        full_name: 'Новый Сотрудник',
        position: 'Тестировщик',
      });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      const added = dept.users.find(u => u.full_name === 'Новый Сотрудник');
      expect(added).toBeDefined();
      expect(added.isVacancy).toBe(false);
      expect(added.scenarioState).toBe('added');
    });

    it('должен возвращать исходный сценарий, если отдел не найден', () => {
      const scenario = createScenario(baseTree);
      const updated = addEmployee(scenario, 'non-existent', { full_name: 'Тест', position: 'Тест' });
      expect(updated).toBe(scenario);
    });

    it('должен сортировать сотрудников после добавления', () => {
      const scenario = createScenario(baseTree);
      const updated = addEmployee(scenario, 'dept-sub', {
        full_name: 'Новый Сотрудник',
        position: 'Стажер',
        subLevel: 100,
      });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      const users = dept.users;
      const empIdx = users.findIndex(u => u.full_name === 'Новый Сотрудник');
      const vacIdx = users.findIndex(u => u.isVacancy);
      // Сотрудники должны быть перед вакансиями
      expect(empIdx).toBeLessThan(vacIdx);
    });

    it('должен пересчитывать численность', () => {
      const scenario = createScenario(baseTree);
      const updated = addEmployee(scenario, 'dept-sub', {
        full_name: 'Новый',
        position: 'Стажер',
      });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      // После recalculateTree: emp-2 + новый = 2 сотрудника
      expect(dept.staffCount).toBe(2);
    });
  });

  describe('editEmployee', () => {
    it('должен обновлять поля сотрудника', () => {
      const scenario = createScenario(baseTree);
      const updated = editEmployee(scenario, 'emp-2', {
        full_name: 'Изменен Петров',
        position: 'Ведущий разработчик',
        email: 'new@mail.com',
      });
      const found = findUserById(updated.workingTree, 'emp-2');
      expect(found.user.full_name).toBe('Изменен Петров');
      expect(found.user.position).toBe('Ведущий разработчик');
      expect(found.user.email).toBe('new@mail.com');
    });

    it('должен устанавливать scenarioState="changed", если не "added"', () => {
      const scenario = createScenario(baseTree);
      const updated = editEmployee(scenario, 'emp-2', { full_name: 'Новое имя' });
      const found = findUserById(updated.workingTree, 'emp-2');
      expect(found.user.scenarioState).toBe('changed');
    });

    it('не должен менять scenarioState, если уже "added"', () => {
      const scenario = createScenario(baseTree);
      const withAdded = addEmployee(scenario, 'dept-sub', { full_name: 'Новый', position: 'Тест' });
      const addedId = withAdded.operations[0].entityId;
      const updated = editEmployee(withAdded, addedId, { full_name: 'Обновлен' });
      const found = findUserById(updated.workingTree, addedId);
      expect(found.user.scenarioState).toBe('added');
    });

    it('должен возвращать исходный сценарий, если сотрудник не найден', () => {
      const scenario = createScenario(baseTree);
      const updated = editEmployee(scenario, 'non-existent', { full_name: 'Тест' });
      expect(updated).toBe(scenario);
    });
  });

  describe('addVacancy', () => {
    it('должен добавлять вакансию', () => {
      const scenario = createScenario(baseTree);
      const updated = addVacancy(scenario, 'dept-sub', { position: 'Новая вакансия' });
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      const added = dept.users.find(u => u.position === 'Новая вакансия' && u.isVacancy);
      expect(added).toBeDefined();
      expect(added.scenarioState).toBe('added');
    });

    it('должен возвращать исходный сценарий, если отдел не найден', () => {
      const scenario = createScenario(baseTree);
      const updated = addVacancy(scenario, 'non-existent', { position: 'Тест' });
      expect(updated).toBe(scenario);
    });
  });

  describe('editVacancy', () => {
    it('должен обновлять вакансию', () => {
      const scenario = createScenario(baseTree);
      const updated = editVacancy(scenario, 'vac-1', {
        position: 'Старший программист',
        project: 'Новый проект',
      });
      const found = findUserById(updated.workingTree, 'vac-1');
      expect(found.user.position).toBe('Старший программист');
      expect(found.user.project).toBe('Новый проект');
    });

    it('должен возвращать исходный сценарий для не-вакансии', () => {
      const scenario = createScenario(baseTree);
      const updated = editVacancy(scenario, 'emp-1', { position: 'Новый' });
      expect(updated).toBe(scenario);
    });
  });

  describe('removeEmployee', () => {
    it('должен удалять сотрудника', () => {
      const scenario = createScenario(baseTree);
      const updated = removeEmployee(scenario, 'emp-2');
      const found = findUserById(updated.workingTree, 'emp-2');
      expect(found).toBeNull();
    });

    it('должен фиксировать операцию', () => {
      const scenario = createScenario(baseTree);
      const updated = removeEmployee(scenario, 'emp-2');
      expect(updated.operations.length).toBe(1);
      expect(updated.operations[0].type).toBe('removeEmployee');
    });

    it('должен пересчитывать численность', () => {
      const scenario = createScenario(baseTree);
      const updated = removeEmployee(scenario, 'emp-2');
      const dept = findDepartmentById(updated.workingTree, 'dept-sub');
      // После удаления emp-2 в dept-sub не остаётся сотрудников (только вакансия)
      expect(dept.staffCount).toBe(0);
    });
  });

  describe('removeVacancy', () => {
    it('должен удалять вакансию', () => {
      const scenario = createScenario(baseTree);
      const updated = removeVacancy(scenario, 'vac-1');
      const found = findUserById(updated.workingTree, 'vac-1');
      expect(found).toBeNull();
    });

    it('должен фиксировать операцию', () => {
      const scenario = createScenario(baseTree);
      const updated = removeVacancy(scenario, 'vac-1');
      expect(updated.operations[0].type).toBe('removeVacancy');
    });
  });

  describe('moveEmployee', () => {
    it('должен перемещать сотрудника между подразделениями', () => {
      const scenario = createScenario(baseTree);
      const updated = moveEmployee(scenario, 'emp-2', 'dept-root');
      const fromDept = findDepartmentById(updated.workingTree, 'dept-sub');
      const toDept = findDepartmentById(updated.workingTree, 'dept-root');
      expect(fromDept.users.find(u => u.id === 'emp-2')).toBeUndefined();
      expect(toDept.users.find(u => u.id === 'emp-2')).toBeDefined();
    });

    it('должен устанавливать scenarioState="moved"', () => {
      const scenario = createScenario(baseTree);
      const updated = moveEmployee(scenario, 'emp-2', 'dept-root');
      const found = findUserById(updated.workingTree, 'emp-2');
      expect(found.user.scenarioState).toBe('moved');
    });
  });

  describe('moveVacancy', () => {
    it('должен перемещать вакансию', () => {
      const scenario = createScenario(baseTree);
      const updated = moveVacancy(scenario, 'vac-1', 'dept-root');
      const fromDept = findDepartmentById(updated.workingTree, 'dept-sub');
      const toDept = findDepartmentById(updated.workingTree, 'dept-root');
      expect(fromDept.users.find(u => u.id === 'vac-1')).toBeUndefined();
      expect(toDept.users.find(u => u.id === 'vac-1')).toBeDefined();
    });
  });

  describe('moveDepartment', () => {
    it('должен перемещать подразделение', () => {
      const scenario = createScenario(baseTree);
      const updated = moveDepartment(scenario, 'dept-sub', 'dept-root');
      const root = findDepartmentById(updated.workingTree, 'dept-root');
      expect(root.children.some(c => c.department_guid === 'dept-sub')).toBe(true);
    });

    it('должен возвращать исходный сценарий при перемещении в самого себя', () => {
      const scenario = createScenario(baseTree);
      const updated = moveDepartment(scenario, 'dept-sub', 'dept-sub');
      expect(updated).toBe(scenario);
    });
  });

  describe('removeDepartment', () => {
    it('должен удалять подразделение с детьми', () => {
      const scenario = createScenario(baseTree);
      const updated = removeDepartment(scenario, 'dept-sub');
      const found = findDepartmentById(updated.workingTree, 'dept-sub');
      expect(found).toBeNull();
    });

    it('должен фиксировать операцию', () => {
      const scenario = createScenario(baseTree);
      const updated = removeDepartment(scenario, 'dept-sub');
      expect(updated.operations[0].type).toBe('removeDepartment');
      expect(updated.operations[0].title).toBe('Подразделение');
    });
  });

  describe('getTreeByViewMode', () => {
    it('должен возвращать baseTree для "as-is"', () => {
      const scenario = createScenario(baseTree);
      const tree = getTreeByViewMode(scenario, 'as-is');
      expect(tree).toBe(scenario.baseTree);
    });

    it('должен возвращать workingTree для "to-be"', () => {
      const scenario = createScenario(baseTree);
      const tree = getTreeByViewMode(scenario, 'to-be');
      expect(tree).toBe(scenario.workingTree);
    });

    it('должен возвращать workingTree для "changes"', () => {
      const scenario = createScenario(baseTree);
      const tree = getTreeByViewMode(scenario, 'changes');
      expect(Array.isArray(tree)).toBe(true);
    });

    it('должен возвращать workingTree для неизвестного режима', () => {
      const scenario = createScenario(baseTree);
      const tree = getTreeByViewMode(scenario, 'unknown');
      expect(tree).toBe(scenario.workingTree);
    });
  });

  describe('getScenarioStats', () => {
    it('должен возвращать корректную статистику', () => {
      const scenario = createScenario(baseTree);
      const stats = getScenarioStats(scenario);
      expect(stats.asIs.departments).toBe(2);
      expect(stats.asIs.staff).toBe(2);
      expect(stats.asIs.vacancies).toBe(1);
      expect(stats.toBe).toEqual(stats.asIs);
      expect(stats.diff.departments).toBe(0);
      expect(stats.diff.staff).toBe(0);
      expect(stats.diff.vacancies).toBe(0);
    });

    it('должен показывать разницу после добавления', () => {
      const scenario = createScenario(baseTree);
      const updated = addEmployee(scenario, 'dept-sub', { full_name: 'Новый', position: 'Тест' });
      const stats = getScenarioStats(updated);
      expect(stats.diff.staff).toBe(1);
    });
  });

  describe('getDepartmentOptions', () => {
    it('должен возвращать опции для всех подразделений', () => {
      const scenario = createScenario(baseTree);
      const options = getDepartmentOptions(scenario.workingTree);
      expect(options.length).toBe(2);
      expect(options[0].id).toBe('dept-root');
      expect(options[1].id).toBe('dept-sub');
    });
  });

  describe('findDepartmentById', () => {
    it('должен находить подразделение', () => {
      const scenario = createScenario(baseTree);
      const found = findDepartmentById(scenario.workingTree, 'dept-sub');
      expect(found).not.toBeNull();
      expect(found.department_name).toBe('Подразделение');
    });

    it('должен возвращать null, если не найдено', () => {
      const scenario = createScenario(baseTree);
      const found = findDepartmentById(scenario.workingTree, 'non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findUserById', () => {
    it('должен находить сотрудника', () => {
      const scenario = createScenario(baseTree);
      const found = findUserById(scenario.workingTree, 'emp-2');
      expect(found).not.toBeNull();
      expect(found.user.full_name).toBe('Петр Петров');
      expect(found.department.department_guid).toBe('dept-sub');
    });

    it('должен возвращать null, если не найден', () => {
      const scenario = createScenario(baseTree);
      const found = findUserById(scenario.workingTree, 'non-existent');
      expect(found).toBeNull();
    });
  });
});