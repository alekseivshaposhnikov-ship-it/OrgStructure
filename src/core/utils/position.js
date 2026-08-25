/**
 * position.js
 * Общие утилиты бизнес-сортировки сотрудников по уровню должности.
 * Ранее дублировались в api.js, scenario-manager.js; используются также
 * в ролевой агрегации PDF-экспорта (CR-003-02).
 */

/** Возвращает вес должности: меньше — выше позиция в иерархии. */
export function positionWeight(user) {
  if (Number.isFinite(user.subLevel)) return user.subLevel;

  const position = String(user.position || "").toLowerCase();

  if (position.includes("директор")) return 1;
  if (position.includes("руководитель")) return 2;
  if (position.includes("начальник")) return 3;
  if (position.includes("лидер") || position.includes("lead")) return 4;
  if (position.includes("ведущий")) return 5;
  if (position.includes("старший")) return 6;
  if (position.includes("главный")) return 6;

  return 100;
}

/** Сортирует сотрудников: сначала занятые, затем по уровню должности, затем по имени. */
export function sortUsersByPositionLevel(a, b) {
  if (a.isVacancy !== b.isVacancy) {
    return a.isVacancy ? 1 : -1;
  }

  const levelDiff = positionWeight(a) - positionWeight(b);
  if (levelDiff !== 0) return levelDiff;

  return String(a.full_name || a.position || "").localeCompare(
    String(b.full_name || b.position || ""),
    "ru",
  );
}
