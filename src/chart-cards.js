export function renderNodeContent(nd, options = {}) {
  const {
    cardDesign = "classic",
    showVacancies = true,
    viewMode = "to-be",
    hideNames = false,
    isPdfExport = false,
  } = options;

  if (nd.isDepartment) {
    if (isPdfExport) {
      return renderDepartmentPdf(nd, showVacancies, hideNames);
    }

    if (cardDesign === "variant2") {
      return renderDepartmentVariant2(nd, showVacancies, viewMode);
    }

    if (cardDesign === "variant3") {
      return renderDepartmentVariant3(nd, showVacancies, viewMode);
    }

    return renderDepartmentClassic(nd, showVacancies, viewMode);
  }

  if (nd.isAssistant) {
    return isPdfExport
      ? renderAssistantCardPdf(nd, hideNames)
      : renderAssistantCard(nd, viewMode);
  }

  if (nd.isVacancy) {
    return isPdfExport ? renderVacancyPdf(nd) : renderVacancy(nd, viewMode);
  }

  return isPdfExport ? renderEmployeePdf(nd, hideNames) : renderEmployee(nd, viewMode);
}

function renderDepartmentPdf(nd, showVacancies, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-department ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      <div class="chart-card-pdf__eyebrow">Подразделение</div>
      <div class="chart-card-pdf__title">${escapeHtml(nd.name)}</div>

      ${
        !hideNames && nd.headName
          ? `<div class="chart-card-pdf__person">${escapeHtml(nd.headName)}</div>`
          : ""
      }

      ${
        nd.headPosition
          ? `<div class="chart-card-pdf__position">${escapeHtml(nd.headPosition)}</div>`
          : ""
      }

      ${renderAssistantPdf(nd.assistant, hideNames)}

      <div class="chart-card-pdf__footer">
        <span class="chart-card-pdf__count">${getDisplayCount(nd, showVacancies)}</span>
        <span>${showVacancies ? "штат + вакансии" : "штат"}</span>
      </div>
    </div>
  `;
}

function renderEmployeePdf(nd, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      <div class="chart-card-pdf__eyebrow">Сотрудник</div>
      ${!hideNames ? `<div class="chart-card-pdf__person">${escapeHtml(nd.name)}</div>` : ""}
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderAssistantCardPdf(nd, hideNames) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-employee ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      <div class="chart-card-pdf__eyebrow">Административный ассистент</div>
      ${!hideNames ? `<div class="chart-card-pdf__person">${escapeHtml(nd.name)}</div>` : ""}
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderVacancyPdf(nd) {
  return `
    <div class="chart-card chart-card--pdf chart-card--pdf-vacancy ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="vacancy">
      <div class="chart-card-pdf__eyebrow">Вакансия</div>
      ${nd.position ? `<div class="chart-card-pdf__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProjectPdf(nd)}
    </div>
  `;
}

function renderAssistantPdf(assistant, hideNames) {
  if (!assistant) return "";

  return `
    <div class="chart-card-pdf__assistant">
      <div class="chart-card-pdf__eyebrow">Административный ассистент</div>
      ${
        !hideNames
          ? `<div class="chart-card-pdf__assistant-name">${escapeHtml(assistant.full_name || assistant.name || "Сотрудник")}</div>`
          : ""
      }
      ${
        assistant.position
          ? `<div class="chart-card-pdf__assistant-position">${escapeHtml(assistant.position)}</div>`
          : ""
      }
      ${renderProjectPdf(assistant)}
    </div>
  `;
}

function renderProjectPdf(nd) {
  const project = normalizeProjects(nd.project);
  if (!project) return "";

  return `
    <div class="chart-card-pdf__project">
      Проект: ${escapeHtml(project)}
    </div>
  `;
}

function renderAssistantCard(nd, viewMode) {
  return `
    <div class="chart-card chart-card--assistant ${getScenarioClass(nd)}"
         data-employee-id="${escapeHtml(nd.id)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="employee">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__assistant-label">Административный ассистент</div>
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      ${nd.position ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProject(nd)}
    </div>
  `;
}

function renderDepartmentClassic(nd, showVacancies, viewMode) {
  return `
    <div class="chart-card chart-card--department ${getScenarioClass(nd)}"
         data-node-id="${escapeHtml(nd.id)}"
         data-node-type="department">
      ${renderScenarioBadge(nd)}
      ${renderMenuButton(viewMode)}
      <div class="chart-card__title">${escapeHtml(nd.name)}</div>
      <div class="chart-card__manager">${escapeHtml(nd.headName || "Нет руководителя")}</div>
      ${nd.headPosition ? `<div class="chart-card__manager-position">${escapeHtml(nd.headPosition)}</div>` : ""}
      ${renderAssistant(nd.assistant)}
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
      <div class="chart-card-v2__header"><div class="chart-card-v2__title">${escapeHtml(nd.name)}</div></div>
      <div class="chart-card-v2__body">
        <div class="chart-card-v2__manager">${escapeHtml(nd.headName || "Нет руководителя")}</div>
        ${nd.headPosition ? `<div class="chart-card-v2__position">${escapeHtml(nd.headPosition)}</div>` : ""}
        ${renderAssistant(nd.assistant)}
      </div>
      <div class="chart-card-v2__footer">${getDisplayCount(nd, showVacancies)} сотрудников</div>
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
      <div class="chart-card-v3__avatar">${escapeHtml(getInitials(nd.headName))}</div>
      <div class="chart-card-v3__content">
        <div class="chart-card-v3__title">${escapeHtml(nd.name)}</div>
        <div class="chart-card-v3__manager">${escapeHtml(nd.headName || "Нет руководителя")}</div>
        ${nd.headPosition ? `<div class="chart-card-v3__position">${escapeHtml(nd.headPosition)}</div>` : ""}
        ${renderAssistant(nd.assistant)}
        <div class="chart-card-v3__count">${getDisplayCount(nd, showVacancies)} сотрудников</div>
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
      ${nd.position ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProject(nd)}
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
      ${nd.position ? `<div class="chart-card__position">${escapeHtml(nd.position)}</div>` : ""}
      ${renderProject(nd)}
    </div>
  `;
}

function renderAssistant(assistant) {
  if (!assistant) return "";

  return `
    <div class="chart-card__assistant" data-assistant-id="${escapeHtml(assistant.id || "")}">
      <div class="chart-card__assistant-label">Административный ассистент</div>
      <div class="chart-card__assistant-name">${escapeHtml(assistant.full_name || assistant.name || "Сотрудник")}</div>
      ${assistant.position ? `<div class="chart-card__assistant-position">${escapeHtml(assistant.position)}</div>` : ""}
      ${renderProject(assistant)}
    </div>
  `;
}

function renderProject(nd) {
  const project = normalizeProjects(nd.project);
  if (!project) return "";

  return `
    <div class="chart-card__project">
      <span>Проект:</span> ${escapeHtml(project)}
    </div>
  `;
}

function normalizeProjects(value) {
  return String(value || "")
    .split(";")
    .map(item => item.trim())
    .filter(Boolean)
    .join("; ");
}

function renderMenuButton(viewMode) {
  if (viewMode === "as-is") return "";

  return `
    <button class="chart-card__menu" type="button" data-scenario-menu>
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
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
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
