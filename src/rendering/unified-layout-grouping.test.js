import { describe, it, expect } from "vitest";
import {
  computeUnifiedLayout,
  NODE_EMPLOYEES,
  measureEmployeeCardHeight,
  measureGroupCardHeight,
} from "./unified-layout.js";

function deptUsers(users) {
  return {
    id: "dept-1",
    department_guid: "dept-1",
    department_name: "Дирекция по развитию",
    department_manager: "Винник Лев Арнольдович",
    department_manager_position: "Директор по развитию",
    manager_sub_level: 2,
    staffCount: users.length,
    vacancyCount: 0,
    totalWithVacancies: users.length,
    users,
    children: [],
  };
}

function emp(id, full_name, position, extra = {}) {
  return {
    id,
    full_name,
    name: full_name,
    position,
    subLevel: 6,
    isVacancy: false,
    ...extra,
  };
}

function employeeColumn(layout) {
  const empNodes = layout.nodes.filter((node) => node.type === NODE_EMPLOYEES);
  return empNodes[0] || null;
}

describe("unified-layout: presentation-группировка по должности (CR-023)", () => {
  it("в обычном режиме создаёт одиночные person-элементы", () => {
    const layout = computeUnifiedLayout(
      deptUsers([
        emp("1", "Петров Петр", "Специалист"),
        emp("2", "Сидоров Семен", "Специалист"),
      ]),
      { groupByPosition: false },
    );

    const column = employeeColumn(layout);
    expect(column.persons).toHaveLength(2);
    expect(column.persons.every((person) => person.type === "person")).toBe(true);
  });

  it("в режиме группировки объединяет одинаковые должности в одну группу (§11 сценарий 1)", () => {
    const layout = computeUnifiedLayout(
      deptUsers([
        emp("1", "Дрожжина Анжела", "Главный инженер проекта"),
        emp("2", "Пермяков Александр", "Главный инженер проекта"),
        emp("3", "Пинигин Илья", "Главный инженер проекта"),
      ]),
      { groupByPosition: true, measureContent: true },
    );

    const column = employeeColumn(layout);
    expect(column.persons).toHaveLength(1);
    const group = column.persons[0];
    expect(group.type).toBe("group");
    expect(group.data.isGroup).toBe(true);
    expect(group.data.position).toBe("Главный инженер проекта");
    expect(group.members).toHaveLength(3);
  });

  it("участники группы доступны в flatData по собственному id (§5, §8)", () => {
    const layout = computeUnifiedLayout(
      deptUsers([
        emp("1", "Дрожжина Анжела", "Главный инженер проекта"),
        emp("2", "Пермяков Александр", "Главный инженер проекта"),
      ]),
      { groupByPosition: true, measureContent: true },
    );

    const ids = layout.flatData.map((item) => item.id);
    expect(ids).toContain("1");
    expect(ids).toContain("2");
  });

  it("группирует только внутри подразделения (§11 сценарий 3)", () => {
    const root = deptUsers([
      emp("1", "Петров Петр", "Специалист"),
      emp("2", "Сидоров Семен", "Специалист"),
    ]);
    root.children = [
      {
        id: "child-1",
        department_guid: "child-1",
        department_name: "Отдел",
        department_manager: "",
        manager_sub_level: 4,
        staffCount: 2,
        vacancyCount: 0,
        totalWithVacancies: 2,
        users: [
          emp("3", "Иванов Иван", "Специалист"),
          emp("4", "Смирнов Семен", "Специалист"),
        ],
        children: [],
      },
    ];

    const layout = computeUnifiedLayout(root, {
      groupByPosition: true,
      measureContent: true,
    });

    const columns = layout.nodes.filter((node) => node.type === NODE_EMPLOYEES);
    expect(columns).toHaveLength(2);
    columns.forEach((column) => {
      expect(column.persons).toHaveLength(1);
      expect(column.persons[0].type).toBe("group");
      expect(column.persons[0].members).toHaveLength(2);
    });
  });

  it("высота групповой карточки растёт с числом ФИО, одиночная короче фиксированной", () => {
    const single = measureEmployeeCardHeight(
      { displayName: "Иванов Иван", position: "Специалист" },
      350,
    );
    const group = measureGroupCardHeight(
      {
        position: "Специалист",
        members: [
          { displayName: "Иванов Иван" },
          { displayName: "Петров Петр" },
          { displayName: "Сидоров Семен" },
        ],
      },
      350,
    );

    // Компактная одиночная карточка заметно ниже прежних 96px (CR-023 §6.2).
    expect(single).toBeLessThan(96);
    expect(group).toBeGreaterThan(single);
  });

  it("измеряет высоту по содержимому: длинная должность даёт больше строк", () => {
    const short = measureEmployeeCardHeight(
      { displayName: "Иванов Иван", position: "Водитель" },
      350,
    );
    const long = measureEmployeeCardHeight(
      {
        displayName: "Иванов Иван",
        position:
          "Руководитель группы по работе с ключевыми клиентами и стратегическими партнёрами компании",
      },
      350,
    );

    expect(long).toBeGreaterThan(short);
  });
});
