import { describe, it, expect } from "vitest";
import {
  computeUnifiedLayout,
  NODE_EMPLOYEES,
  NODE_DEPARTMENT,
  measureEmployeeCardHeight,
  measureGroupCardHeight,
  measureLayoutDebugHeight,
  formatLayoutDebugText,
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

describe("unified-layout: диагностические показатели (CR-023-01)", () => {
  function dept(extra = {}) {
    return {
      id: "d1",
      department_guid: "d1",
      department_name: "Отдел",
      department_manager: "Иванов Иван",
      department_manager_position: "Руководитель",
      manager_sub_level: 4,
      staffCount: 1,
      vacancyCount: 0,
      totalWithVacancies: 1,
      users: [
        {
          id: "u1",
          full_name: "Петров Петр",
          name: "Петров Петр",
          position: "Специалист",
          subLevel: 6.2,
          isVacancy: false,
        },
      ],
      children: [],
      ...extra,
    };
  }

  it("§5.3: измерение учитывает рамку и padding строк (группа из 3 полностью помещается)", () => {
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

    // border(2*2) + padding(6*2) + header(15) + margin(3) + 3*(padding 2 + line 16) + 2*gap(3)
    expect(group).toBe(94);

    const single = measureEmployeeCardHeight(
      { displayName: "Иванов Иван", position: "Специалист" },
      350,
    );
    // border(2*2) + padding(6*2) + name(16) + gap(3) + position(14)
    expect(single).toBe(49);
  });

  it("§2.2: глубина подразделения проставляется в data (level) и растёт вниз по дереву", () => {
    const root = dept({
      children: [
        {
          id: "c1",
          department_guid: "c1",
          department_name: "Отдел 2",
          manager_sub_level: 4,
          staffCount: 0,
          vacancyCount: 0,
          totalWithVacancies: 0,
          users: [],
          children: [],
        },
      ],
    });

    const layout = computeUnifiedLayout(root, { measureContent: true });
    const departments = layout.nodes.filter((node) => node.type === NODE_DEPARTMENT);
    const byId = (id) => departments.find((node) => node.data.id === id);

    expect(byId("d1").data.level).toBe(0);
    expect(byId("c1").data.level).toBe(1);
  });

  it("§3, §5.5: showLevels увеличивает высоту карточек на высоту диагностической строки", () => {
    const root = dept();

    const off = computeUnifiedLayout(root, { measureContent: true, showLevels: false });
    const on = computeUnifiedLayout(root, { measureContent: true, showLevels: true });

    const empOff = off.nodes.find((node) => node.type === NODE_EMPLOYEES);
    const empOn = on.nodes.find((node) => node.type === NODE_EMPLOYEES);
    expect(empOn.height).toBeGreaterThan(empOff.height);
    expect(empOn.persons[0].height).toBeGreaterThan(empOff.persons[0].height);

    const deptOff = off.nodes.find((node) => node.type === NODE_DEPARTMENT);
    const deptOn = on.nodes.find((node) => node.type === NODE_DEPARTMENT);
    expect(deptOn.height).toBeGreaterThan(deptOff.height);
  });

  it("§2: диагностика подразделения содержит level, sub, layout и row", () => {
    const text = formatLayoutDebugText({
      level: 3,
      actualManagerSubLevel: 4,
      effectiveLayoutLevel: 4,
      row: 2,
    });
    expect(text).toBe("level: 3 · sub: 4 · layout: 4 · row: 2");
  });

  it("§2.1: диагностика сотрудника содержит sub и заглушки layout/row", () => {
    const text = formatLayoutDebugText({ subLevel: 6.2 });
    expect(text).toBe("sub: 6.2 · layout: — · row: —");
  });

  it("§3.1: высота диагностической строки растёт при переносе текста", () => {
    const data = { level: 4, actualManagerSubLevel: 4.1, effectiveLayoutLevel: 4, row: 2 };
    const wide = measureLayoutDebugHeight(data, 350);
    const narrow = measureLayoutDebugHeight(data, 120);
    expect(wide).toBeGreaterThan(0);
    expect(narrow).toBeGreaterThan(wide);
  });
});
