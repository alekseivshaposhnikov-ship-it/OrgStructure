/**
 * compact-a4-layout.js
 *
 * Секционный layout для компактного A4 landscape.
 * - Root-узел сверху
 * - Дочерние отделы размещаются горизонтальными секциями (колонками)
 * - Сотрудники/вакансии/ассистенты — компактный grid внутри отдела или справа/снизу
 */

export const A4_WIDTH = 1122;
export const A4_HEIGHT = 794;

export const PADDING_X = 24;
export const PADDING_Y = 24;
export const HEADER_HEIGHT = 80;

// Размеры карточек
export const DEPT_W = 220;
export const DEPT_H = 64;
export const PERSON_W = 190;
export const PERSON_H = 38;

// Отступы
export const V_GAP = 10;
export const H_GAP = 8;
export const SECTION_GAP_X = 20;
export const SECTION_GAP_Y = 14;
export const ITEM_GAP_X = 12;   // между карточками персон по горизонтали в grid
export const ITEM_GAP_Y = 6;    // по вертикали
export const SUBSECTION_GAP = 16; // между блоком подразделений и блоком персон

export const MIN_SCALE = 0.45;

// Максимум колонок в grid персон
const MAX_ITEM_COLS = 3;

/**
 * Главная функция layout.
 */
export function calculateCompactLayout(rootNode) {
  if (!rootNode) return null;

  const layoutTree = buildNode(rootNode, null, 0);
  assignPositions(layoutTree, PADDING_X, PADDING_Y + HEADER_HEIGHT);

  const bounds = getBounds(layoutTree);
  const totalW = bounds.width;
  const totalH = bounds.height;

  const availW = A4_WIDTH - 2 * PADDING_X;
  const availH = A4_HEIGHT - HEADER_HEIGHT - 2 * PADDING_Y;

  let scale = Math.min(availW / Math.max(totalW, 1), availH / Math.max(totalH, 1), 1);

  if (scale < MIN_SCALE) {
    scale = MIN_SCALE;
    if (totalW * scale > availW || totalH * scale > availH) {
      return makeResult(layoutTree, [], scale, totalW, totalH, false);
    }
  }

  const flat = [];
  flatten(layoutTree, flat);

  // Валидация
  validateNoOverlaps(flat);

  return makeResult(layoutTree, flat, scale, totalW, totalH, true);
}

function makeResult(root, flat, scale, tw, th, canFit) {
  return {
    root, flat, scale,
    fitsInA4: canFit,
    totalWidth: tw,
    totalHeight: th,
    a4Width: A4_WIDTH,
    a4Height: A4_HEIGHT,
    canFit,
  };
}

// === Построение дерева ===

function buildNode(node, parentId, depth) {
  const isDept = node.type === 'department';
  const w = isDept ? DEPT_W : PERSON_W;
  const h = isDept ? DEPT_H : PERSON_H;

  if (!isDept || !(node.children && node.children.length)) {
    return {
      ...node, parentId, depth, w, h,
      children: [],
      items: [],
      sections: [],
      subtreeW: w, subtreeH: h + V_GAP,
    };
  }

  // Строим всех детей
  const allChildren = node.children.map(c => buildNode(c, node.id, depth + 1));

  // Делим на отделы и персон
  const subDepts = allChildren.filter(c => c.type === 'department');
  const persons = allChildren.filter(c => c.type !== 'department');

  // Секции из подразделений
  const sections = buildSections(subDepts, h);
  const sectionsWidth = sections.reduce((sum, s, i) =>
    sum + s.w + (i > 0 ? SECTION_GAP_X : 0), 0);
  const sectionsHeight = sections.length > 0
    ? sections.reduce((max, s) => Math.max(max, s.h), 0)
    : 0;

  // Grid items
  const itemGrid = layoutItems(persons);
  const itemsGridW = itemGrid.w;
  const itemsGridH = itemGrid.h;

  // Считаем габариты
  const subtreeW = Math.max(w, sectionsWidth, itemsGridW);

  let subtreeH = h + SECTION_GAP_Y;
  if (sectionsHeight > 0 && itemsGridH > 0) {
    // Две зоны подряд
    subtreeH += sectionsHeight + SUBSECTION_GAP + itemsGridH;
  } else if (sectionsHeight > 0) {
    subtreeH += sectionsHeight;
  } else if (itemsGridH > 0) {
    subtreeH += itemsGridH;
  } else {
    subtreeH -= SECTION_GAP_Y; // ничего нет — убираем лишний отступ
  }

  return {
    ...node, parentId, depth, w, h,
    children: allChildren,
    sections,
    items: itemGrid.items,
    itemsCols: itemGrid.cols,
    itemsRows: itemGrid.rows,
    itemsW: itemsGridW,
    itemsH: itemsGridH,
    sectionsWidth,
    sectionsHeight,
    subtreeW, subtreeH,
  };
}

/**
 * Разбивает дочерние отделы на секции (колонки),
 * учитывая доступную высоту A4.
 */
function buildSections(subDepts, parentH) {
  if (!subDepts.length) return [];

  const availH = A4_HEIGHT - HEADER_HEIGHT - 2 * PADDING_Y - parentH - SECTION_GAP_Y * 3;
  const maxSectionW = A4_WIDTH - 2 * PADDING_X;

  const sections = [];
  let current = [], curH = 0, curW = 0;

  const sorted = [...subDepts].sort((a, b) => b.subtreeH - a.subtreeH);

  sorted.forEach(child => {
    if (child.subtreeH > availH) {
      if (current.length) {
        sections.push({ children: current, w: curW, h: curH });
        current = []; curH = 0; curW = 0;
      }
      sections.push({ children: [child], w: child.subtreeW, h: child.subtreeH });
      return;
    }
    const nextH = Math.max(curH, child.subtreeH);
    const nextW = Math.max(curW, child.subtreeW);
    if (nextH <= availH && nextW <= maxSectionW) {
      current.push(child);
      curH = nextH;
      curW = nextW;
    } else {
      if (current.length) sections.push({ children: current, w: curW, h: curH });
      current = [child];
      curH = child.subtreeH;
      curW = child.subtreeW;
    }
  });
  if (current.length) sections.push({ children: current, w: curW, h: curH });
  return sections;
}

/**
 * Раскладывает персоны в grid.
 */
function layoutItems(persons) {
  if (!persons.length) return { items: [], w: 0, h: 0, cols: 0, rows: 0 };

  const availW = A4_WIDTH - 2 * PADDING_X;
  const maxCols1 = Math.max(1, Math.floor(availW / (PERSON_W + ITEM_GAP_X)));

  let cols = 1;
  if (persons.length > 3) cols = Math.min(MAX_ITEM_COLS, maxCols1, Math.ceil(persons.length / 2));
  const rows = Math.ceil(persons.length / cols);

  const gridW = cols * PERSON_W + (cols - 1) * ITEM_GAP_X;
  const gridH = rows * PERSON_H + (rows - 1) * ITEM_GAP_Y;

  persons.forEach((p, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    p._gridRow = r;
    p._gridCol = c;
  });

  return { items: persons, w: gridW, h: gridH, cols, rows };
}

// === Расстановка позиций ===

function assignPositions(node, x, y) {
  node.x = x;
  node.y = y;

  const isDept = node.type === 'department';
  if (!isDept || (!node.sections.length && !node.items.length)) return;

  // Дочерние отделы — ниже карточки отдела
  if (node.sections.length) {
    let secLeft = x;
    const secTop = y + node.h + SECTION_GAP_Y;
    node.sections.forEach(sec => {
      let top = secTop;
      sec.children.forEach(child => {
        assignPositions(child, secLeft, top);
        top += child.subtreeH + SECTION_GAP_Y;
      });
      secLeft += sec.w + SECTION_GAP_X;
    });
  }

  // Items grid — после секций (или сразу после карточки, если секций нет)
  if (node.items.length) {
    const itemsTopY = y + node.h + SECTION_GAP_Y
      + (node.sectionsHeight || 0)
      + (node.sectionsHeight > 0 ? SUBSECTION_GAP : 0);

    node.items.forEach(p => {
      p.x = x + p._gridCol * (PERSON_W + ITEM_GAP_X);
      p.y = itemsTopY + p._gridRow * (PERSON_H + ITEM_GAP_Y);
    });
  }
}

// === Bounds ===

function getBounds(root) {
  let maxR = 0, maxB = 0, minY = Infinity;
  walk(root, n => {
    maxR = Math.max(maxR, n.x + (n.w || 0));
    maxB = Math.max(maxB, n.y + (n.h || 0));
    minY = Math.min(minY, n.y);
  });
  return { width: maxR, height: maxB - minY };
}

function walk(node, cb) {
  cb(node);
  // items — подмножество children, обходим только children чтобы избежать дублирования
  (node.children || []).forEach(c => walk(c, cb));
}

function flatten(root, result) {
  walk(root, n => {
    result.push({
      id: n.id,
      type: n.type,
      name: n.name || '',
      manager: n.manager || '',
      position: n.position || '',
      count: n.count,
      project: n.project || '',
      scenarioState: n.scenarioState || '',
      parentId: n.parentId || null,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      cardWidth: n.w,
      cardHeight: n.h,
      depth: n.depth,
    });
  });
}

// === Валидация ===

function validateNoOverlaps(flat) {
  const overlaps = [];
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i], b = flat[j];
      if (a.x < b.x + b.cardWidth &&
          a.x + a.cardWidth > b.x &&
          a.y < b.y + b.cardHeight &&
          a.y + a.cardHeight > b.y) {
        overlaps.push(`${a.id} ↔ ${b.id}`);
      }
    }
  }
  if (overlaps.length) {
    console.warn('[compact-a4-layout] Найдены наложения карточек:', overlaps);
  }
}

// === Конвертер ===

export function convertToCompactTree(exportNode) {
  if (!exportNode) return null;
  return {
    id: exportNode.id,
    type: exportNode.type,
    name: exportNode.name || '',
    manager: exportNode.manager || '',
    position: exportNode.position || '',
    count: exportNode.count,
    project: exportNode.project || '',
    scenarioState: exportNode.scenarioState || '',
    children: (exportNode.children || []).map(c => convertToCompactTree(c)).filter(Boolean),
  };
}