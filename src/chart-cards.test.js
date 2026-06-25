import { describe, it, expect } from 'vitest';
import { renderNodeContent } from './chart-cards.js';

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
    it('должен рендерить department classic с названием и руководителем', () => {
      const html = renderNodeContent(makeDepartmentNode(), { cardDesign: 'classic' });
      expect(html).toContain('Отдел продаж');
      expect(html).toContain('Иван Иванов');
      expect(html).toContain('chart-card--department');
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
  });
});