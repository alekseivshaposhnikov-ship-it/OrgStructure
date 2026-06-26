/**
 * compact-a4-svg-renderer.js
 *
 * Рисует компактную orgchart-диаграмму в SVG для A4 landscape.
 * Раздельные renderer'ы: department, employee, vacancy, assistant.
 */

import { A4_WIDTH, A4_HEIGHT, PADDING_X, PADDING_Y, HEADER_HEIGHT, DEPT_W, DEPT_H, PERSON_W, PERSON_H } from './compact-a4-layout.js';

const C = {
  blue: '#155eef',
  blueLight: '#eef4ff',
  text: '#101828',
  muted: '#667085',
  border: '#d0d5dd',
  line: '#98a2b3',
  white: '#ffffff',
  deptBg: '#f8fbff',
  vacancyBg: '#f0f9ff',
  vacancyStroke: '#7cc4f8',
  assistantBg: '#f8fafc',
  assistantStroke: '#9e77ed',
  addedBg: '#dcfae6', addedText: '#067647',
  changedBg: '#dbeafe', changedText: '#1d4ed8',
  movedBg: '#f4e8ff', movedText: '#7e22ce',
  removedBg: '#fee4e2', removedText: '#b42318',
};

export function renderCompactSvg(layoutResult, options = {}) {
  const { title = 'Организационная структура', subtitle = '' } = options;
  const { flat, scale, a4Width, a4Height, canFit } = layoutResult;

  if (!canFit || !flat || !flat.length) {
    return renderError('Структуру невозможно уместить на один лист A4 без потери читаемости');
  }

  const svg = createSvg('svg', {
    width: a4Width, height: a4Height,
    viewBox: `0 0 ${a4Width} ${a4Height}`,
    xmlns: 'http://www.w3.org/2000/svg',
  });
  svg.appendChild(createSvg('rect', { x: 0, y: 0, width: a4Width, height: a4Height, fill: C.white }));
  drawHeader(svg, { title, subtitle, width: a4Width });

  const diag = createSvg('g', {
    transform: scale !== 1 ? `translate(0,0) scale(${scale})` : 'translate(0,0)',
  });

  const nodesMap = new Map(flat.map(n => [n.id, n]));
  drawAllConnectors(diag, flat, nodesMap);

  flat.forEach(n => {
    if (n.type === 'department') drawDeptCard(diag, n);
    else if (n.type === 'vacancy') drawVacancyCard(diag, n);
    else if (n.type === 'assistant') drawAssistantCard(diag, n);
    else drawEmployeeCard(diag, n);
  });

  svg.appendChild(diag);
  return svg;
}

// === Связи ===

function drawAllConnectors(group, flat, map) {
  const byParent = new Map();
  flat.forEach(n => { if (n.parentId) { const a = byParent.get(n.parentId) || []; a.push(n); byParent.set(n.parentId, a); } });

  byParent.forEach((children, pid) => {
    const p = map.get(pid); if (!p) return;
    const px = p.x + p.cardWidth / 2;
    const py = p.y + p.cardHeight;
    if (children.length === 1) {
      const c = children[0];
      drawPath(group, px, py, c.x + c.cardWidth / 2, c.y);
      return;
    }
    const sorted = [...children].sort((a, b) => a.y - b.y);
    const first = sorted[0], last = sorted[sorted.length - 1];
    const trunkY = py + (first.y - py) / 2;
    drawPath(group, px, py, px, trunkY);
    let minX = Infinity, maxX = -Infinity;
    children.forEach(c => { const cx = c.x + c.cardWidth / 2; if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; });
    drawPath(group, minX, trunkY, maxX, trunkY);
    children.forEach(c => drawPath(group, c.x + c.cardWidth / 2, trunkY, c.x + c.cardWidth / 2, c.y));
  });
}

function drawPath(g, x1, y1, x2, y2) {
  const d = x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} V ${y1 + (y2 - y1) / 2} H ${x2} V ${y2}`;
  g.appendChild(createSvg('path', { d, fill: 'none', stroke: C.line, 'stroke-width': 1.5 }));
}

// === Карточки ===

function drawDeptCard(g, n) {
  const grp = createSvg('g', { transform: `translate(${n.x}, ${n.y})` });
  grp.appendChild(createSvg('rect', { x: 0, y: 0, width: n.cardWidth, height: n.cardHeight, rx: 8, ry: 8, fill: C.deptBg, stroke: C.blue, 'stroke-width': 2 }));
  if (n.scenarioState) drawBadge(grp, n.scenarioState);

  drawText(grp, n.name, { x: 10, y: n.scenarioState ? 26 : 16, maxW: n.cardWidth - 20, fontSize: 11, fw: 600, fill: C.text, maxLines: 2, lineH: 13 });
  if (n.manager) drawText(grp, n.manager, {
    x: 10, y: n.scenarioState ? 42 : 32,
    maxW: n.cardWidth - 60, fontSize: 9, fw: 400, fill: '#344054', maxLines: 1, lineH: 11,
  });
  if (n.position) {
    const posY = n.manager ? (n.scenarioState ? 54 : 44) : (n.scenarioState ? 42 : 32);
    if (posY < n.cardHeight - 4) drawText(grp, n.position, {
      x: 10, y: posY, maxW: n.cardWidth - 60, fontSize: 8, fw: 400, fill: C.muted, maxLines: 1, lineH: 10,
    });
  }
  if (n.count != null) {
    grp.appendChild(createSvg('rect', { x: n.cardWidth - 34, y: n.cardHeight - 20, width: 24, height: 14, rx: 7, ry: 7, fill: C.blueLight }));
    addText(grp, String(n.count), n.cardWidth - 22, n.cardHeight - 9, 8, 700, C.blue, 'middle');
  }
  if (n.project) {
    grp.appendChild(createSvg('rect', { x: 6, y: n.cardHeight - 20, width: Math.min(n.cardWidth - 60, 120), height: 14, rx: 7, ry: 7, fill: '#f2f4f7' }));
    addText(grp, `П: ${trunc(n.project, 18)}`, 12, n.cardHeight - 9, 7, 400, '#475467');
  }
  g.appendChild(grp);
}

function drawEmployeeCard(g, n) {
  const grp = createSvg('g', { transform: `translate(${n.x}, ${n.y})` });
  grp.appendChild(createSvg('rect', { x: 0, y: 0, width: n.cardWidth, height: n.cardHeight, rx: 5, ry: 5, fill: C.white, stroke: C.border, 'stroke-width': 1 }));
  if (n.scenarioState) drawBadge(grp, n.scenarioState);

  const nameY = n.scenarioState ? 22 : 13;
  drawText(grp, n.name, { x: 8, y: nameY, maxW: n.cardWidth - 16, fontSize: 9, fw: 600, fill: C.text, maxLines: 2, lineH: 11 });
  if (n.position) {
    const posY = nameY + (n.name ? 13 : 0);
    if (posY < n.cardHeight - 4) drawText(grp, n.position, {
      x: 8, y: posY, maxW: n.cardWidth - 16, fontSize: 7, fw: 400, fill: C.muted, maxLines: 1, lineH: 9,
    });
  }
  if (n.project) {
    grp.appendChild(createSvg('rect', { x: 4, y: n.cardHeight - 14, width: Math.min(n.cardWidth - 30, 100), height: 10, rx: 5, ry: 5, fill: '#f2f4f7' }));
    addText(grp, `П: ${trunc(n.project, 14)}`, 8, n.cardHeight - 6, 6, 400, '#475467');
  }
  g.appendChild(grp);
}

function drawVacancyCard(g, n) {
  const grp = createSvg('g', { transform: `translate(${n.x}, ${n.y})` });
  grp.appendChild(createSvg('rect', { x: 0, y: 0, width: n.cardWidth, height: n.cardHeight, rx: 5, ry: 5, fill: C.vacancyBg, stroke: C.vacancyStroke, 'stroke-width': 1.5 }));
  addText(grp, 'Вакансия', 8, 14, 9, 700, C.blue);
  if (n.position) drawText(grp, n.position, { x: 8, y: 26, maxW: n.cardWidth - 16, fontSize: 7, fw: 400, fill: C.muted, maxLines: 1, lineH: 9 });
  g.appendChild(grp);
}

function drawAssistantCard(g, n) {
  const grp = createSvg('g', { transform: `translate(${n.x}, ${n.y})` });
  grp.appendChild(createSvg('rect', { x: 0, y: 0, width: n.cardWidth, height: n.cardHeight, rx: 5, ry: 5, fill: C.assistantBg, stroke: C.assistantStroke, 'stroke-width': 1.5 }));
  addText(grp, 'Адм. ассистент', 8, 14, 8, 600, C.assistantStroke);
  if (n.name) drawText(grp, n.name, { x: 8, y: 26, maxW: n.cardWidth - 16, fontSize: 7, fw: 400, fill: C.text, maxLines: 1, lineH: 9 });
  g.appendChild(grp);
}

// === Утилиты ===

function drawBadge(g, state) {
  const lbl = {added:'NEW',changed:'Изм',moved:'Пер',removed:'Удал'}[state] || '';
  const clr = {added:{bg:C.addedBg,txt:C.addedText},changed:{bg:C.changedBg,txt:C.changedText},moved:{bg:C.movedBg,txt:C.movedText},removed:{bg:C.removedBg,txt:C.removedText}}[state] || {bg:'#f2f4f7',txt:'#344054'};
  g.appendChild(createSvg('rect', { x: 6, y: 5, width: lbl.length * 6 + 10, height: 13, rx: 6.5, ry: 6.5, fill: clr.bg }));
  addText(g, lbl, 11, 15, 7, 700, clr.txt);
}

function drawText(g, text, { x, y, maxW, fontSize, fw, fill, maxLines = 2, lineH }) {
  const lines = wrap(String(text || ''), maxW, fontSize, maxLines);
  lines.forEach((l, i) => addText(g, l, x, y + i * lineH, fontSize, fw, fill));
}

function addText(g, text, x, y, fontSize, fw, fill, anchor = 'start') {
  const t = createSvg('text', { x, y, 'font-family': 'Arial, sans-serif', 'font-size': fontSize, 'font-weight': fw, fill, 'text-anchor': anchor });
  t.textContent = text || '';
  g.appendChild(t);
}

function wrap(text, maxW, fontSize, maxLines) {
  const cw = fontSize * 0.53;
  const maxLen = Math.max(4, Math.floor(maxW / cw));
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  for (const w of words) {
    const nxt = cur ? `${cur} ${w}` : w;
    if (nxt.length > maxLen) {
      if (cur) { lines.push(cur); cur = w; }
      else {
        // Одно слово длиннее maxLen — обрезаем
        let leftover = w;
        while (leftover.length > maxLen) {
          lines.push(leftover.slice(0, maxLen));
          leftover = leftover.slice(maxLen);
          if (lines.length >= maxLines) break;
        }
        cur = leftover || '';
      }
    } else { cur = nxt; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.splice(maxLines);
  if (lines.length > 0 && lines.length >= maxLines) {
    const last = lines[lines.length - 1];
    if (last.length > 2) lines[lines.length - 1] = last.slice(0, -1) + '…';
  }
  return lines.length ? lines : [''];
}

function trunc(text, len) { return text.length <= len ? text : text.slice(0, len - 1) + '…'; }

function drawHeader(svg, { title, subtitle, width }) {
  addText(svg, 'Организационная структура', PADDING_X, 24, 10, 700, C.blue);
  addText(svg, title, PADDING_X, 42, 18, 700, C.text);
  if (subtitle) addText(svg, subtitle, PADDING_X, 58, 10, 400, C.muted);
  addText(svg, new Intl.DateTimeFormat('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date()), width - PADDING_X, 42, 10, 400, C.muted, 'end');
  svg.appendChild(createSvg('line', { x1: PADDING_X, y1: 72, x2: width - PADDING_X, y2: 72, stroke: '#e4e7ec', 'stroke-width': 1 }));
}

function renderError(msg) {
  const s = createSvg('svg', { width: A4_WIDTH, height: A4_HEIGHT, viewBox: `0 0 ${A4_WIDTH} ${A4_HEIGHT}`, xmlns: 'http://www.w3.org/2000/svg' });
  s.appendChild(createSvg('rect', { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT, fill: C.white }));
  addText(s, msg, A4_WIDTH / 2, A4_HEIGHT / 2, 16, 700, '#f04438', 'middle');
  return s;
}

function createSvg(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
  return e;
}

export { createSvg as createSvgElement };