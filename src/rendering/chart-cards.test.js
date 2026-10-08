import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderNodeContent, layoutDebugConfig } from './chart-cards.js';

function makeDepartmentNode(overrides = {}) {
  return {
    id: 'dept-1',
    isDepartment: true,
    name: overrides.name || 'Отдел продаж',
    headName: overrides.headName || 'Иван Иванов',
    headPosition: overrides.headPosition || 'Руководитель отдела',
    staffCount: overrides.staffCount ?? 10,
    vacancyCount: overrides.vacancyCount ?? 2,
    totalWithVacancies: overrides.totalWithVacancies ?? 12,
    scenarioState: overrides.scenarioState || '',
    assistant: overrides.assistant || null,
    project: overrides.project || '',
    ...overrides,
  };
}

function makeEmployeeNode(overrides = {}) {
  return {
    id: 'emp-1',
    isDepartment: false,
    isVacancy: false,
    isAssistant: false,
    name: overrides.name || 'Петр Петров',
    full_name: overrides.name || 'Петр Петров',
    position: overrides.position || 'Разработчик',
    project: overrides.project || '',
    scenarioState: overrides.scenarioState || '',
    ...overrides,
  };
}

function makeVacancyNode(overrides = {}) {
  return makeEmployeeNode({
    id: 'vac-1',
    name: 'Вакансия',
    isVacancy: true,
    position: overrides.position || 'Программист',
    project: overrides.project || '',
    ...overrides,
  });
}

function makeAssistantNode(overrides = {}) {
  return makeEmployeeNode({
    id: 'ast-1',
    isAssistant: true,
    name: overrides.name || 'Анна Секретарь',
    position: overrides.position || 'Административный ассистент',
    ...overrides,
  });
}

describe('chart-cards.js', () => {
  describe('renderNodeContent', () => {
    const previousDebug = layoutDebugConfig.enabled;

    beforeEach(() => {
      layoutDebugConfig.enabled = true;
    });

    afterEach(() => {
      layoutDebugConfig.enabled = previousDebug;
    });

    it('должен рендерить department classic с названием и руководителем', () => {
      const html = renderNodeContent(makeDepartmentNode(), { cardDesign: 'classic' });
      expect(html).toContain('Отдел продаж');
      expect(html).toContain('Иван Иванов');
      expect(html).toContain('chart-card--department');
    });

    it('должен показывать «Вакансия» для подразделения без руководителя (CR-020 §2)', () => {
      const html = renderNodeContent(makeDepartmentNode({ headName: '', headDisplayName: '' }), {
        cardDesign: 'classic',
      });
      expect(html).toContain('Вакансия');
      expect(html).not.toContain('Нет руководителя');
    });

    it('должен рендерить department variant2 с классом v2', () => {
      const html = renderNodeContent(makeDepartmentNode(), { cardDesign: 'variant2' });
      expect(html).toContain('chart-card--department-v2');
      expect(html).toContain('сотрудников');
    });

    it('должен рендерить department variant3 с инициалами', () => {
      const html = renderNodeContent(makeDepartmentNode({ headName: 'Иван Иванов' }), { cardDesign: 'variant3' });
      expect(html).toContain('chart-card--department-v3');
      expect(html).toContain('chart-card-v3__avatar');
      expect(html).toContain('ИИ');
    });

    it('должен рендерить employee с ФИО и должностью', () => {
      const html = renderNodeContent(makeEmployeeNode());
      expect(html).toContain('Петр Петров');
      expect(html).toContain('Разработчик');
      expect(html).toContain('data-employee-id="emp-1"');
    });

    it('должен рендерить vacancy с текстом "Вакансия"', () => {
      const html = renderNodeContent(makeVacancyNode());
      expect(html).toContain('chart-card--vacancy');
      expect(html).toContain('Вакансия');
    });

    it('должен рендерить assistant с меткой "Административный ассистент"', () => {
      const html = renderNodeContent(makeAssistantNode());
      expect(html).toContain('chart-card--assistant');
      expect(html).toContain('Административный ассистент');
    });

    it('должен рендерить группу административных ассистентов одной карточкой (CR-020 §6)', () => {
      const html = renderNodeContent({
        id: 'assistant-group-1',
        isAssistant: true,
        position: 'Административный ассистент',
        members: [
          { id: 'a1', displayName: 'Рысь Екатерина', position: 'Административный ассистент' },
          { id: 'a2', displayName: 'Тимофеева Алена', position: 'Административный ассистент' },
        ],
      });
      expect(html).toContain('chart-card--assistant-group');
      expect(html).toContain('Рысь Екатерина');
      expect(html).toContain('Тимофеева Алена');
    });

    it('должен рендерить department в PDF режиме', () => {
      const html = renderNodeContent(makeDepartmentNode(), { isPdfExport: true });
      expect(html).toContain('chart-card--pdf-department');
      expect(html).toContain('Подразделение');
    });

    it('должен рендерить employee в PDF режиме', () => {
      const html = renderNodeContent(makeEmployeeNode(), { isPdfExport: true });
      expect(html).toContain('chart-card--pdf-employee');
      expect(html).toContain('Сотрудник');
    });

    it('должен рендерить vacancy в PDF режиме', () => {
      const html = renderNodeContent(makeVacancyNode(), { isPdfExport: true });
      expect(html).toContain('chart-card--pdf-vacancy');
    });

    it('должен скрывать имена при hideNames=true', () => {
      const html = renderNodeContent(makeEmployeeNode({ name: 'Петр Петров' }), { isPdfExport: true, hideNames: true });
      expect(html).not.toContain('Петр Петров');
    });

    it('должен отображать scenario-badge при scenarioState="added"', () => {
      const html = renderNodeContent(makeDepartmentNode({ scenarioState: 'added' }));
      expect(html).toContain('scenario-badge');
      expect(html).toContain('NEW');
    });

    it('должен отображать проект в карточке', () => {
      const html = renderNodeContent(makeEmployeeNode({ project: 'Проект Альфа' }));
      expect(html).toContain('Проект Альфа');
      expect(html).toContain('chart-card__project');
    });

    it('должен отображать кнопку меню только в to-be режиме', () => {
      const htmlToBe = renderNodeContent(makeDepartmentNode(), { viewMode: 'to-be' });
      expect(htmlToBe).toContain('data-scenario-menu');

      const htmlAsIs = renderNodeContent(makeDepartmentNode(), { viewMode: 'as-is' });
      expect(htmlAsIs).not.toContain('data-scenario-menu');
    });

    it('должен показывать debug-уровни руководителя в карточке подразделения', () => {
      const html = renderNodeContent(makeDepartmentNode({ managerSubLevel: 2 }));
      expect(html).toContain('sub: 2');
      expect(html).toContain('chart-card__layout-debug');
    });

    it('должен показывать sub: — при отсутствии значения у руководителя', () => {
      const html = renderNodeContent(makeDepartmentNode());
      expect(html).toContain('sub: —');
    });

    it('должен показывать sub сотрудника', () => {
      const html = renderNodeContent(makeEmployeeNode({ subLevel: 3 }));
      expect(html).toContain('sub: 3');
    });

    it('не должен показывать debug в PDF-режиме', () => {
      const html = renderNodeContent(makeDepartmentNode({ managerSubLevel: 2 }), { isPdfExport: true });
      expect(html).not.toContain('chart-card__layout-debug');
    });

    it('не должен показывать debug, когда флаг выключен', () => {
      layoutDebugConfig.enabled = false;
      const html = renderNodeContent(makeDepartmentNode({ managerSubLevel: 2 }));
      expect(html).not.toContain('chart-card__layout-debug');
      expect(html).not.toContain('sub: 2');
    });

    it('должен выводить layout и row, если они переданы в data', () => {
      const html = renderNodeContent(
        makeDepartmentNode({ managerSubLevel: 4, effectiveLayoutLevel: 4, row: 1 }),
      );
      expect(html).toContain('layout: 4');
      expect(html).toContain('row: 1');
    });

    it('employee card использует displayName, а не полное ФИО (CR-016 §34)', () => {
      const html = renderNodeContent(
        makeEmployeeNode({
          name: 'Елизарова Лаура Вячеславовна',
          full_name: 'Елизарова Лаура Вячеславовна',
          displayName: 'Елизарова Лаура',
        }),
      );
      expect(html).toContain('Елизарова Лаура');
      expect(html).not.toContain('Елизарова Лаура Вячеславовна');
    });

    it('department card использует headDisplayName (CR-016 §30)', () => {
      const html = renderNodeContent(
        makeDepartmentNode({
          headName: 'Глазунов Всеволод Игоревич',
          headDisplayName: 'Глазунов Всеволод',
        }),
        { cardDesign: 'classic' },
      );
      expect(html).toContain('Глазунов Всеволод');
      expect(html).not.toContain('Глазунов Всеволод Игоревич');
    });

    it('executive card: топ-3 полное ФИО, остальные сокращённые (CR-016 §20, §23, §48-49)', () => {
      const selivanov = renderNodeContent(
        makeEmployeeNode({
          isHoldingExecutive: true,
          name: 'Селиванов Василий Геннадиевич',
          displayName: 'Селиванов Василий Геннадиевич',
          headPosition: 'Генеральный директор',
        }),
      );
      expect(selivanov).toContain('Селиванов Василий Геннадиевич');

      const vinnik = renderNodeContent(
        makeEmployeeNode({
          isHoldingExecutive: true,
          name: 'Винник Лев Арнольдович',
          displayName: 'Винник Лев',
          headPosition: 'Директор по развитию',
        }),
      );
      expect(vinnik).toContain('Винник Лев');
      expect(vinnik).not.toContain('Винник Лев Арнольдович');
    });

    it('assistant card использует displayName (CR-016 §32)', () => {
      const html = renderNodeContent(
        makeAssistantNode({
          name: 'Лихачева Екатерина Олеговна',
          displayName: 'Лихачева Екатерина',
        }),
      );
      expect(html).toContain('Лихачева Екатерина');
      expect(html).not.toContain('Лихачева Екатерина Олеговна');
    });

    it('должен рендерить групповую карточку: должность один раз, счётчик и ФИО (CR-023 §5)', () => {
      const html = renderNodeContent({
        id: 'employee-group-1',
        isGroup: true,
        isDepartment: false,
        isVacancy: false,
        isAssistant: false,
        position: 'Главный инженер проекта',
        memberCount: 3,
        members: [
          { id: 'm1', displayName: 'Дрожжина Анжела', position: 'Главный инженер проекта' },
          { id: 'm2', displayName: 'Пермяков Александр', position: 'Главный инженер проекта' },
          { id: 'm3', displayName: 'Пинигин Илья', position: 'Главный инженер проекта' },
        ],
      });

      expect(html).toContain('chart-card--group');
      expect(html).toContain('Главный инженер проекта');
      expect(html).toContain('chart-card__group-count');
      expect(html).toContain('>3<');
      expect(html).toContain('Дрожжина Анжела');
      expect(html).toContain('Пермяков Александр');
      expect(html).toContain('Пинигин Илья');
    });

    it('каждый участник группы — самостоятельный интерактивный элемент (CR-023 §5)', () => {
      const html = renderNodeContent(
        {
          id: 'employee-group-1',
          isGroup: true,
          position: 'Специалист',
          members: [
            { id: 'm1', displayName: 'Петров Петр' },
            { id: 'm2', displayName: 'Сидоров Семен' },
          ],
        },
        { viewMode: 'to-be' },
      );

      expect(html).toContain('data-employee-id="m1"');
      expect(html).toContain('data-employee-id="m2"');
      // Меню доступно для каждого участника, а не только для первого.
      expect(html.match(/data-scenario-menu/g)).toHaveLength(2);
    });

    it('должен рендерить групповую карточку в PDF-режиме (CR-023 §9)', () => {
      const html = renderNodeContent(
        {
          id: 'employee-group-1',
          isGroup: true,
          position: 'Главный инженер проекта',
          members: [
            { id: 'm1', displayName: 'Дрожжина Анжела' },
            { id: 'm2', displayName: 'Пермяков Александр' },
          ],
        },
        { isPdfExport: true },
      );

      expect(html).toContain('chart-card--pdf-group');
      expect(html).toContain('Дрожжина Анжела');
      expect(html).toContain('Пермяков Александр');
    });

    it('в PDF-режиме скрывает ФИО участников группы при hideNames (CR-023 §9)', () => {
      const html = renderNodeContent(
        {
          id: 'employee-group-1',
          isGroup: true,
          position: 'Главный инженер проекта',
          members: [{ id: 'm1', displayName: 'Дрожжина Анжела' }],
        },
        { isPdfExport: true, hideNames: true },
      );

      expect(html).not.toContain('Дрожжина Анжела');
    });
  });
});