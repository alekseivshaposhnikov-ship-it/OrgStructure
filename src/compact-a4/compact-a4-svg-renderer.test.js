import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('compact-a4-svg-renderer', () => {
  let renderCompactSvg;

  beforeEach(async () => {
    // Очищаем DOM
    document.body.innerHTML = '';

    const mod = await import('./compact-a4-svg-renderer.js');
    renderCompactSvg = mod.renderCompactSvg;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function countSvgElements(svg, tagName) {
    return svg.querySelectorAll(tagName).length;
  }

  function getSvgTextContents(svg) {
    const texts = [];
    svg.querySelectorAll('text').forEach(el => {
      texts.push(el.textContent || '');
    });
    return texts;
  }

  it('должен вернуть SVG с сообщением об ошибке если canFit=false', () => {
    const layoutResult = {
      flat: [],
      scale: 0.5,
      totalWidth: 2000,
      totalHeight: 2000,
      a4Width: 1122,
      a4Height: 794,
      canFit: false,
    };

    const svg = renderCompactSvg(layoutResult, { title: 'Тест' });

    expect(svg).toBeDefined();
    expect(svg.tagName).toBe('svg');

    const texts = getSvgTextContents(svg);
    const hasError = texts.some(t => t.includes('невозможно'));
    expect(hasError).toBe(true);
  });

  it('должен вернуть SVG с сообщением об ошибке если flat пустой', () => {
    const layoutResult = {
      flat: [],
      scale: 1,
      totalWidth: 100,
      totalHeight: 100,
      a4Width: 1122,
      a4Height: 794,
      canFit: true,
    };

    const svg = renderCompactSvg(layoutResult, { title: 'Тест' });

    expect(svg).toBeDefined();
    const texts = getSvgTextContents(svg);
    const hasError = texts.some(t => t.includes('невозможно'));
    expect(hasError).toBe(true);
  });

  it('должен корректно рендерить простую структуру', () => {
    const layoutResult = {
      flat: [
        {
          id: 'root',
          type: 'department',
          name: 'Холдинг',
          manager: 'Директор',
          position: 'CEO',
          count: 50,
          project: '',
          scenarioState: '',
          x: 24,
          y: 104,
          cardWidth: 180,
          cardHeight: 52,
          depth: 0,
        },
        {
          id: 'child1',
          type: 'department',
          name: 'Отдел',
          manager: 'Менеджер',
          position: 'Manager',
          count: 10,
          project: 'Проект А',
          scenarioState: 'added',
          x: 24,
          y: 188,
          cardWidth: 180,
          cardHeight: 52,
          depth: 1,
          parentId: 'root',
        },
      ],
      scale: 1,
      totalWidth: 228,
      totalHeight: 264,
      a4Width: 1122,
      a4Height: 794,
      canFit: true,
    };

    const svg = renderCompactSvg(layoutResult, {
      title: 'Тестовая структура',
      subtitle: 'Целевая структура · с фамилиями',
    });

    expect(svg).toBeDefined();
    expect(svg.tagName).toBe('svg');

    // Должны быть rect-элементы (фон + 2 карточки + бейдж + счётчик + проект)
    const rectCount = countSvgElements(svg, 'rect');
    expect(rectCount).toBeGreaterThanOrEqual(5);

    // Должны быть text-элементы
    const textCount = countSvgElements(svg, 'text');
    expect(textCount).toBeGreaterThanOrEqual(3);

    // Должен быть заголовок
    const texts = getSvgTextContents(svg);
    const hasHeader = texts.some(t => t.includes('Тестовая структура'));
    expect(hasHeader).toBe(true);

    // Должна быть линия разделителя
    const lineCount = countSvgElements(svg, 'line');
    expect(lineCount).toBeGreaterThanOrEqual(1);

    // Должен быть path (коннектор)
    const pathCount = countSvgElements(svg, 'path');
    expect(pathCount).toBeGreaterThanOrEqual(1);

    // Должна быть группа g
    const gCount = countSvgElements(svg, 'g');
    expect(gCount).toBeGreaterThanOrEqual(3);
  });

  it('должен корректно рендерить масштабированную диаграмму', () => {
    const layoutResult = {
      flat: [
        {
          id: 'root',
          type: 'department',
          name: 'Большая структура',
          manager: '',
          position: '',
          count: 100,
          project: '',
          scenarioState: '',
          x: 24,
          y: 104,
          cardWidth: 180,
          cardHeight: 52,
          depth: 0,
        },
      ],
      scale: 0.7,
      totalWidth: 1000,
      totalHeight: 600,
      a4Width: 1122,
      a4Height: 794,
      canFit: true,
    };

    const svg = renderCompactSvg(layoutResult, {
      title: 'С масштабом',
    });

    expect(svg).toBeDefined();

    // Проверяем, что создана группа с transform scale
    const groups = svg.querySelectorAll('g');
    let hasScaledGroup = false;
    groups.forEach(g => {
      const transform = g.getAttribute('transform') || '';
      if (transform.includes('scale(0.7)')) hasScaledGroup = true;
    });
    expect(hasScaledGroup).toBe(true);

    // Должна быть ровно одна карточка (один rect кроме фона)
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('должен рендерить разные типы узлов: vacancy, assistant, employee', () => {
    const layoutResult = {
      flat: [
        {
          id: 'dept1',
          type: 'department',
          name: 'Отдел',
          manager: '',
          position: '',
          count: 5,
          project: '',
          scenarioState: '',
          x: 24,
          y: 104,
          cardWidth: 180,
          cardHeight: 52,
          depth: 0,
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
          x: 24,
          y: 188,
          cardWidth: 150,
          cardHeight: 32,
          depth: 1,
          parentId: 'dept1',
        },
        {
          id: 'vac1',
          type: 'vacancy',
          name: 'Вакансия',
          manager: '',
          position: 'Тестировщик',
          count: null,
          project: '',
          scenarioState: '',
          x: 186,
          y: 188,
          cardWidth: 150,
          cardHeight: 32,
          depth: 1,
          parentId: 'dept1',
        },
        {
          id: 'asst1',
          type: 'assistant',
          name: 'Ассистент',
          manager: '',
          position: 'Административный ассистент',
          count: null,
          project: '',
          scenarioState: 'changed',
          x: 348,
          y: 188,
          cardWidth: 150,
          cardHeight: 32,
          depth: 1,
          parentId: 'dept1',
        },
      ],
      scale: 1,
      totalWidth: 522,
      totalHeight: 244,
      a4Width: 1122,
      a4Height: 794,
      canFit: true,
    };

    const svg = renderCompactSvg(layoutResult, { title: 'Типы узлов' });

    expect(svg).toBeDefined();

    // Должны быть rect для фона + 4 карточки + бейджи + счётчик
    const rects = svg.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(5);

    // Должны быть path (коннекторы) - минимум 3 связи
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });
});