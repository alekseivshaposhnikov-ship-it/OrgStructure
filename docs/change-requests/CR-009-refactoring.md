# CR-009. Рефакторинг: оптимизация и поддерживаемость

Статус: Реализован
Дата: 18.08.2026
Связано с: CR-007, CR-008_1

## Проблема

* Монолитный `main.js` (~918 строк) без тестов.
* Дублирование утилит: `escapeHtml` ×4, `normalizeProjects` ×3,
  `shortPosition`/`parseSubLevel` ×2, `formatDate` ×2, `MODE_TITLES` ×2.
* Дублирование SVG→PDF конвейера в `pdf-d3-export.js`.
* Два независимых layout для Compact A4: экран (`computeUnifiedLayout`)
  и PDF (`calculateCompactLayout`) — расхождение вывода.
* Сгенерированные артефакты в git (`dist/`, `coverage/`, `project-context.txt`).
* Отсутствие ESLint/Prettier и документации архитектуры.

## Цель

Устранить дублирование, декомпозировать UI, унифицировать layout Compact A4,
настроить инструменты качества и довести покрытие тестами до приемлемого уровня.

## Реализованные изменения

### Фаза 0 — Инфраструктура
- ESLint 9 (flat config) + Prettier, скрипты `lint`/`format`.
- `dist/`, `coverage/`, `project-context.txt` исключены из git
  (добавлены в `.gitignore`).
- Генератор контекста перенесён в `scripts/generate-context.js`
  (npm-скрипт `context`).
- Создана `docs/architecture.md`.

### Фаза 1 — Общие утилиты
- `src/core/utils/string.js`: `escapeHtml`, `normalizeProjects`, `formatDate`, `sanitizeFileName`.
- `src/core/utils/tree.js`: `cloneTree`, `addLevels`, `shortPosition`, `parseSubLevel`, `findDepartmentById`.
- `src/core/constants.js`: `VIEW_MODE_TITLES`.
- `src/layout.js` удалён (логика в `core/utils/tree.js`).

### Фаза 2 — Декомпозиция main.js (918 → 260 строк)
- `src/ui/app-state.js` — единое состояние.
- `src/ui/scenario-forms.js` — модальные формы.
- `src/ui/scenario-actions.js` — контекстное меню и операции сценария.
- `src/ui/changes-panel.js` — статистика, изменения, сравнение.
- `src/ui/orgchart.js` — рендер диаграммы, делегирование, экспорт.

### Фаза 3 — Консолидация PDF-экспорта
- `src/export/pdf-utils.js`: единый `renderSvgToPdf` и `withExportBusyState`
  (заменяют `saveSvgAsPdf`/`saveCompactSvgAsA4Pdf` и дублирующиеся обёртки).
- Compact A4 PDF переведён на единый `computeUnifiedLayout`
  через `buildCompactA4LayoutResult`; отдельный `calculateCompactLayout`
  и `convertToCompactTree` удалены вместе с `compact-a4-layout.js` секционным алгоритмом.
- `unifiedLayoutToCompactFlat` перенесён в `compact-a4-layout.js` и
  переиспользуется экраном и PDF.

### Фаза 4 — Унификация рендеринга
- `src/rendering/svg-utils.js`: `createSvgElement`, `appendText`, `addText`, `truncateText`.
- `src/rendering/tokens.js`: палитра `COLORS`, `SCENARIO_LABELS`,
  `getScenarioLabel`, `getScenarioColors`.
- Устранены дубли `getScenarioLabel` (chart-cards/pdf) и
  `findAdministrativeAssistantInSubtree` (unified-layout/pdf).
- Debug-вывод `sub_level` выключен по умолчанию
  (включается через `localStorage["orgShowSubLevelDebug"] === "1"`).

### Фаза 5 — Стабилизация
- Новые тесты: `core/*`, `ui/*`, `rendering/*`, `sidebar-tree`, `employee-modal`,
  `export/pdf-utils`, общий хелпер `src/test-utils.js`.
- Документация: `docs/architecture.md`.

## Критерии приёмки

- [x] `npm test` — зелёный (230 тестов).
- [x] `npm run lint` — без ошибок и предупреждений.
- [x] `npm run build` — успешно.
- [x] Нет дублирующихся утилит между модулями.
- [x] Один layout-движок для Compact A4 (экран и PDF).
- [x] `main.js` — тонкий композиционный слой.
- [x] Артефакты сборки/контекста не в git.

## Что не менялось

* Бизнес-логика сценариев (`scenario-manager.js`).
* Единый layout (`computeUnifiedLayout`) и sub_level-логика.
* API данных и формат PDF-файлов (пиксельный вывод обычного PDF сохранён;
  компактный PDF переведён на единый layout — вывод изменён, требует визуальной
  сверки на реальных данных).
