export function renderNodeContent(nd, options) {
  const { cardDesign, showVacancies, viewMode } = options;

  if (nd.isDepartment) {
    if (cardDesign === "variant2") {
      return renderDepartmentVariant2(nd, showVacancies, viewMode);
    }

    if (cardDesign === "variant3") {
      return renderDepartmentVariant3(nd, showVacancies, viewMode);
    }

    return renderDepartmentClassic(nd, showVacancies, viewMode);
  }

  if (nd.isVacancy) {
    return renderVacancy(nd, viewMode);
  }

  return renderEmployee(nd, viewMode);
}

function renderDepartmentClassic(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}

      ${renderMenuButton(viewMode)}

      <div class="chart-card__title">${escapeHtml(nd.name)}</div>

      <div class="chart-card__manager">
        👤 ${escapeHtml(nd.headName || "Нет руководителя")}
      </div>

      ${
        nd.headPosition
          ? `<div class="chart-card__manager-position">${escapeHtml(nd.headPosition)}</div>`
          : ""
      }

      <div class="chart-card__count ${showVacancies ? "count-with-vacancies" : ""}">
        ${getDisplayCount(nd, showVacancies)}
      </div>
    </div>
  `;
}

function renderDepartmentVariant2(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department-v2 ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}

      ${renderMenuButton(viewMode)}

      <div class="chart-card-v2__header">
        <div class="chart-card-v2__title">${escapeHtml(nd.name)}</div>
      </div>

      <div class="chart-card-v2__body">
        <div class="chart-card-v2__manager">
          ${escapeHtml(nd.headName || "Нет руководителя")}
        </div>

        ${
          nd.headPosition
            ? `<div class="chart-card-v2__position">${escapeHtml(nd.headPosition)}</div>`
            : ""
        }
      </div>

      <div class="chart-card-v2__footer">
        ${getDisplayCount(nd, showVacancies)} сотрудников
      </div>
    </div>
  `;
}

function renderDepartmentVariant3(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department-v3 ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}

      ${renderMenuButton(viewMode)}

      <div class="chart-card-v3__avatar">
        ${escapeHtml(getInitials(nd.headName))}
      </div>

      <div class="chart-card-v3__content">
        <div class="chart-card-v3__title">${escapeHtml(nd.name)}</div>

        <div class="chart-card-v3__manager">
          ${escapeHtml(nd.headName || "Нет руководителя")}
        </div>

        ${
          nd.headPosition
            ? `<div class="chart-card-v3__position">${escapeHtml(nd.headPosition)}</div>`
            : ""
        }

        <div class="chart-card-v3__count">
          ${getDisplayCount(nd, showVacancies)} сотрудников
        </div>
      </div>
    </div>
  `;
}

function renderEmployee(nd, viewMode) {
  return `
    <div class="chart-card chart-card--employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      ${renderScenarioBadge(nd)}

      ${renderMenuButton(viewMode)}

      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      ${
        nd.position
          ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
          : ""
      }
    </div>
  `;
}

function renderVacancy(nd, viewMode) {
  return `
    <div class="chart-card chart-card--vacancy ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="vacancy">
      ${renderScenarioBadge(nd)}

      ${renderMenuButton(viewMode)}

      <div class="chart-card__title">Вакансия</div>
      ${
        nd.position
          ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>`
          : ""
      }
    </div>
  `;
}

function renderMenuButton(viewMode) {
  if (viewMode === "as-is") return "";

  return `
    <button class="chart-card__menu"
            type="button"
            data-scenario-menu>
      ⋮
    </button>
  `;
}

function renderScenarioBadge(nd) {
  const label = getScenarioLabel(nd.scenarioState);

  if (!label) return "";

  return `
    <div class="scenario-badge scenario-badge--${escapeHtml(nd.scenarioState)}">
      ${escapeHtml(label)}
    </div>
  `;
}

function getScenarioClass(nd) {
  return nd.scenarioState ? `chart-card--scenario-${nd.scenarioState}` : "";
}

function getScenarioLabel(state) {
  if (state === "added") return "NEW";
  if (state === "changed") return "Изменен";
  if (state === "moved") return "Перемещен";
  if (state === "removed") return "Удален";

  return "";
}

function getDisplayCount(node, showVacancies) {
  return showVacancies
    ? node.totalWithVacancies || node.staffCount || 0
    : node.staffCount || 0;
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "—";

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}