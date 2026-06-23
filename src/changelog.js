const CHANGELOG_STORAGE_KEY = "orgAppLastSeenVersion";

const CHANGELOG_ENTRIES = [
  {
    version: "1.5.0",
    date: "2026-06-24",
    title: "Журнал обновлений внутри приложения",
    summary:
      "Добавлен раздел, в котором пользователи могут самостоятельно отслеживать новые версии приложения, реализованные доработки и выполненные пожелания.",
    items: [
      {
        type: "new",
        title: "Раздел «Что нового»",
        description:
          "Внутри приложения добавлен журнал обновлений с историей версий, датами выпуска и описанием изменений.",
      },
      {
        type: "user-request",
        title: "Отображение реализованных пользовательских пожеланий",
        description:
          "В журнале обновлений отдельно показываются доработки, которые были выполнены по пожеланиям пользователей.",
        requestStatus: "Реализовано",
      },
      {
        type: "improvement",
        title: "Индикатор новой версии",
        description:
          "Если пользователь еще не открывал последнюю версию журнала, рядом с кнопкой «Что нового» отображается отметка NEW.",
      },
      {
        type: "technical",
        title: "Локальное хранение просмотренной версии",
        description:
          "Последняя просмотренная версия сохраняется в localStorage и не требует изменений в API или базе данных.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-06-23",
    title: "Проекты и административный ассистент",
    summary:
      "Расширено отображение данных сотрудников, вакансий и административного ассистента в диаграмме и PDF-экспорте.",
    items: [
      {
        type: "improvement",
        title: "Проекты сотрудников и вакансий",
        description:
          "Проект отображается в карточках сотрудников, вакансий, административного ассистента и в детальной карточке сотрудника.",
      },
      {
        type: "improvement",
        title: "Административный ассистент рядом с руководителем",
        description:
          "Административный ассистент выводится рядом с директором или руководителем выбранной верхней структуры.",
      },
      {
        type: "fix",
        title: "Исключение дублей ассистента",
        description:
          "Административный ассистент не отображается повторно в нижнем списке сотрудников, если уже выведен рядом с руководителем.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-06-20",
    title: "Сценарное моделирование организационной структуры",
    summary:
      "Добавлены операции моделирования AS IS / TO BE, список изменений сценария и сравнение текущей и целевой структуры.",
    items: [
      {
        type: "new",
        title: "Режимы AS IS / TO BE / Изменения",
        description:
          "Пользователь может переключаться между текущей структурой, целевой структурой и списком измененных объектов.",
      },
      {
        type: "new",
        title: "Операции сценария",
        description:
          "Добавлены добавление, редактирование, удаление и перемещение подразделений, сотрудников и вакансий.",
      },
      {
        type: "new",
        title: "Панель изменений сценария",
        description:
          "Справа отображается список операций, выполненных в рамках сценария моделирования.",
      },
    ],
  },
];

export function initChangelog({
  openButtonId = "openChangelog",
  badgeId = "changelogBadge",
  modalId = "changelogModal",
  closeButtonId = "closeChangelogModal",
  contentId = "changelogContent",
  latestVersionId = "changelogLatestVersion",
} = {}) {
  const openButton = document.getElementById(openButtonId);
  const badge = document.getElementById(badgeId);
  const modal = document.getElementById(modalId);
  const closeButton = document.getElementById(closeButtonId);
  const content = document.getElementById(contentId);
  const latestVersion = document.getElementById(latestVersionId);

  if (!openButton || !modal || !content) return;

  renderChangelog(content);
  renderLatestVersion(latestVersion);
  updateUnreadBadge(badge);

  openButton.addEventListener("click", () => {
    openChangelogModal(modal, badge);
  });

  closeButton?.addEventListener("click", () => {
    closeChangelogModal(modal);
  });

  modal
    .querySelector("[data-close-changelog]")
    ?.addEventListener("click", () => {
      closeChangelogModal(modal);
    });
}

function openChangelogModal(modal, badge) {
  modal.classList.remove("hidden");
  markLatestVersionAsSeen();
  updateUnreadBadge(badge);
}

function closeChangelogModal(modal) {
  modal.classList.add("hidden");
}

function renderLatestVersion(container) {
  if (!container) return;

  const latestEntry = getLatestEntry();

  if (!latestEntry) {
    container.textContent = "";
    return;
  }

  container.textContent = `Последняя версия: ${latestEntry.version}`;
}

function renderChangelog(container) {
  if (!CHANGELOG_ENTRIES.length) {
    container.innerHTML = `<div class="changelog-empty">Обновлений пока нет</div>`;
    return;
  }

  container.innerHTML = CHANGELOG_ENTRIES.map(renderVersionEntry).join("");

  container.querySelectorAll("[data-changelog-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = button.closest(".changelog-entry");
      if (!entry) return;

      entry.classList.toggle("changelog-entry--collapsed");
    });
  });
}

function renderVersionEntry(entry, index) {
  const isLatest = index === 0;

  return `
    <section class="changelog-entry ${isLatest ? "" : "changelog-entry--collapsed"}">
      <button class="changelog-entry__header" type="button" data-changelog-toggle>
        <span>
          <span class="changelog-entry__version">Версия ${escapeHtml(entry.version)}</span>
          <span class="changelog-entry__date">${escapeHtml(formatDate(entry.date))}</span>
        </span>
        <span class="changelog-entry__toggle">⌄</span>
      </button>

      <div class="changelog-entry__body">
        <h3>${escapeHtml(entry.title)}</h3>
        <p>${escapeHtml(entry.summary)}</p>
        <div class="changelog-items">
          ${(entry.items || []).map(renderChangelogItem).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderChangelogItem(item) {
  return `
    <article class="changelog-item changelog-item--${escapeHtml(item.type)}">
      <div class="changelog-item__type">${escapeHtml(getTypeLabel(item.type))}</div>
      <div class="changelog-item__content">
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description)}</p>
        ${renderRequestStatus(item)}
      </div>
    </article>
  `;
}

function renderRequestStatus(item) {
  if (item.type !== "user-request" && !item.requestStatus) return "";

  return `
    <div class="changelog-item__status">
      Пожелание пользователя: ${escapeHtml(item.requestStatus || "Реализовано")}
    </div>
  `;
}

function getTypeLabel(type) {
  const labels = {
    new: "Новая функция",
    improvement: "Улучшение",
    fix: "Исправление",
    "user-request": "Пожелание",
    technical: "Техническое",
  };

  return labels[type] || "Изменение";
}

function updateUnreadBadge(badge) {
  if (!badge) return;

  if (hasUnreadLatestVersion()) {
    badge.classList.remove("hidden");
    return;
  }

  badge.classList.add("hidden");
}

function hasUnreadLatestVersion() {
  const latestEntry = getLatestEntry();
  if (!latestEntry) return false;

  return localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestEntry.version;
}

function markLatestVersionAsSeen() {
  const latestEntry = getLatestEntry();
  if (!latestEntry) return;

  localStorage.setItem(CHANGELOG_STORAGE_KEY, latestEntry.version);
}

function getLatestEntry() {
  return CHANGELOG_ENTRIES[0] || null;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
