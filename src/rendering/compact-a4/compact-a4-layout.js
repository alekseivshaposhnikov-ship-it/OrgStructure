/**
 * compact-a4-layout.js
 *
 * Константы Compact A4 и построение единого layout-результата.
 *
 * Compact A4 использует ЕДИНЫЙ layout (computeUnifiedLayout) как на экране,
 * так и в PDF (CR-008_1; Фаза 3.3 рефакторинга). Отдельный секционный
 * алгоритм calculateCompactLayout удалён.
 */

import {
  computeUnifiedLayout,
  NODE_DEPARTMENT,
  NODE_EMPLOYEES,
  NODE_ASSISTANT,
} from "../unified-layout.js";
import { normalizeProjects } from "../../core/utils/string.js";

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

export const MIN_SCALE = 0.45;

const AVAILABLE_W = A4_WIDTH - 2 * PADDING_X;
const AVAILABLE_H = A4_HEIGHT - HEADER_HEIGHT - 2 * PADDING_Y;

/**
 * Строит результат для renderCompactSvg на основе единого layout.
 * Используется экранным рендером и PDF-экспортом.
 *
 * @param {object} rootNode - узел дерева API (department_guid/users/children)
 * @param {object} [options]
 * @param {boolean} [options.hideNames=false]
 * @param {boolean} [options.showVacancies=true]
 * @param {Set<string>|null} [options.collapsedIds=null]
 * @returns {{ layout, flat, scale, a4Width, a4Height, canFit }|null}
 */
export function buildCompactA4LayoutResult(
  rootNode,
  { hideNames = false, showVacancies = true, collapsedIds = null } = {},
) {
  if (!rootNode) return null;

  const layout = computeUnifiedLayout(rootNode, {
    showVacancies,
    departmentWidth: DEPT_W,
    departmentHeight: DEPT_H,
    employeeWidth: PERSON_W,
    employeeHeight: PERSON_H,
    assistantWidth: PERSON_W,
    assistantHeight: PERSON_H,
    employeesHeaderHeight: 18,
    colGap: 20,
    rowGap: 16,
    personGap: 4,
    paddingX: PADDING_X,
    paddingY: PADDING_Y + HEADER_HEIGHT,
    collapsedIds,
  });

  const scale = Math.min(
    AVAILABLE_W / Math.max(layout.width, 1),
    AVAILABLE_H / Math.max(layout.height, 1),
    1,
  );
  const canFit = scale >= MIN_SCALE;

  return {
    layout,
    flat: unifiedLayoutToCompactFlat(layout, { hideNames, showVacancies }),
    scale,
    a4Width: A4_WIDTH,
    a4Height: A4_HEIGHT,
    canFit,
  };
}

/**
 * Преобразует узлы единого layout в плоский список карточек Compact A4.
 */
export function unifiedLayoutToCompactFlat(layout, { hideNames, showVacancies }) {
  const flat = [];
  const parentMap = new Map();
  layout.edges.forEach((edge) => parentMap.set(edge.child, edge.parent));

  layout.nodes.forEach((node) => {
    const parent = parentMap.get(node);
    const parentId = parent && parent.data ? parent.data.id : null;

    if (node.type === NODE_DEPARTMENT) {
      const d = node.data;
      const isHoldingExecutive = d.isHoldingExecutive === true;
      flat.push({
        id: d.id,
        type: "department",
        name: d.name,
        manager: hideNames ? "" : d.headName,
        position: d.headPosition,
        // Executive (CR-013 §27): искусственная численность не отображается.
        count: isHoldingExecutive
          ? null
          : showVacancies
            ? d.totalWithVacancies ?? d.staffCount ?? 0
            : d.staffCount ?? 0,
        project: "",
        scenarioState: d.scenarioState,
        isHoldingExecutive,
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
        // Диагностика (CR-010 §4, §9): единый источник значений с экраном
        actualManagerSubLevel: node.actualManagerSubLevel,
        effectiveLayoutLevel: node.effectiveLayoutLevel,
        row: node.row,
      });
    } else if (node.type === NODE_ASSISTANT) {
      const d = node.data;
      flat.push({
        id: d.id,
        type: "assistant",
        name: hideNames ? "" : d.full_name || d.name || "Сотрудник",
        position: d.position || "",
        project: normalizeProjects(d.project),
        scenarioState: d.scenarioState || "",
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
      });
    } else if (node.type === NODE_EMPLOYEES) {
      flat.push({
        id: `employees_${parentId || "root"}`,
        type: "employees",
        header: "Сотрудники",
        parentId,
        x: node.x,
        y: node.y,
        cardWidth: node.width,
        cardHeight: node.height,
        persons: (node.persons || []).map((person) => ({
          id: person.data.id,
          type: person.data.isVacancy ? "vacancy" : "employee",
          name: person.data.isVacancy
            ? "Вакансия"
            : hideNames
              ? ""
              : person.data.name,
          position: String(person.data.position || ""),
          project: normalizeProjects(person.data.project),
          scenarioState: person.data.scenarioState || "",
          cardWidth: person.width,
          cardHeight: person.height,
        })),
      });
    }
  });

  return flat;
}
