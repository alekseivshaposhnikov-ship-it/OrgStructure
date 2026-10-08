# Архитектура проекта

Приложение: организационная диаграмма с моделированием сценариев (AS IS / TO BE / Изменения),
экранным рендером (Classic / Profile / Compact A4) и экспортом в PDF.

Стек: Vanilla JS (ESM) + Vite, D3 v5 (zoom), jsPDF, Vitest + jsdom.

## Слои и зависимости

```
core/            чистые модули (без DOM)
data/            загрузка/трансформация данных
domain/          бизнес-логика сценариев
rendering/       layout, карточки, viewport, screen-рендеры
export/          экспорт в PDF
ui/              DOM-модули интерфейса
main.js          композиция (точка входа)
```

Зависимости направлены «вниз»: `ui → rendering/domain/data → core`. `main.js`
не содержит бизнес-логики — только инициализацию и связывание UI-модулей.

## Состав

### core/ (без DOM)
| Модуль | Назначение |
|---|---|
| `constants.js` | Общие константы (например, `VIEW_MODE_TITLES`) |
| `utils/string.js` | `escapeHtml`, `normalizeProjects`, `formatDate`, `sanitizeFileName` |
| `utils/tree.js` | `cloneTree`, `addLevels`, `shortPosition`, `parseSubLevel`, `findDepartmentById` |
| `utils/position.js` | `positionWeight`, `sortUsersByPositionLevel` (сортировка по уровню должности) |
| `utils/grouping.js` | Presentation-группировка сотрудников по должности (CR-023): `normalizePositionKey`, `buildEmployeePresentations` |

### data/
| Модуль | Назначение |
|---|---|
| `api.js` | Загрузка `/api/getDepartmentVacancy`, фильтры, нормализация узлов |

### domain/
| Модуль | Назначение |
|---|---|
| `scenario-manager.js` | Чистая логика сценариев: CRUD подразделений/сотрудников/вакансий, перемещения, статистика |

### rendering/
| Модуль | Назначение |
|---|---|
| `unified-layout.js` | Единый layout диаграммы (высоты уровней, колонки); presentation-группировка по должности и расчёт высот по содержимому (CR-023) |
| `chart-cards.js` | HTML-карточки (classic / variant2 / variant3 / групповая / PDF-режим) |
| `screen-viewport.js` | Единый viewport: zoom/pan/fit/center (CR-008_1); диапазон масштаба MIN/MAX_ZOOM_SCALE (CR-011) |
| `tokens.js` | Палитра и сценарий-стайлы (CR-009) |
| `svg-utils.js` | Общие SVG-хелперы: createSvgElement, appendText, truncateText |
| `unified-screen-renderer.js` | Экранный рендер через SVG + foreignObject |
| `compact-a4/` | Константы A4, единый layout-результат, SVG-рендер, экранный рендер |

### export/
| Модуль | Назначение |
|---|---|
| `pdf-d3-export.js` | Экспорт в PDF на едином Unified Layout (CR-003) + Compact A4; ролевой режим «без фамилий» (CR-003-02, CR-003-03, fix-height) |
| `pdf-utils.js` | Общий конвейер SVG→PDF и обёртка с блокировкой кнопки (CR-009) |

### ui/
| Модуль | Назначение |
|---|---|
| `app-state.js` | Единый объект состояния приложения |
| `orgchart.js` | Рендер диаграммы, делегирование кликов, обработчик экспорта |
| `scenario-forms.js` | Модальные формы сценариев |
| `scenario-actions.js` | Контекстное меню карточек, обработка операций |
| `changes-panel.js` | Статистика, список изменений, сравнение |
| `sidebar-tree.js` | Дерево подразделений в сайдбаре |
| `employee-modal.js` | Модалка карточки сотрудника |
| `changelog.js` | Журнал обновлений приложения |

## Правила рефакторинга

1. Общие утилиты — только в `core/`, без копий в модулях.
2. Модули не должны читать `document`/`window` на верхнем уровне (кроме `main.js` и тестов).
3. После изменений обязательны: `npm test`, `npm run build`, `npm run lint`.
4. Изменение поведения — отдельный CR в `docs/change-requests/`.

## Команды

```bash
npm run dev          # локальный сервер (Vite)
npm run build        # production-сборка
npm test             # Vitest (jsdom)
npm run lint         # ESLint
npm run format       # Prettier --write
npm run context      # перегенерировать project-context.txt
```
