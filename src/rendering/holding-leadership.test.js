import { describe, it, expect, vi } from "vitest";
import {
  buildHoldingLeadershipTree,
  HOLDING_LEADERSHIP_CONFIG,
  collectUsersByEmail,
  selectPrimaryRecord,
  matchesConfiguredDepartment,
  resolveExecutiveKey,
} from "./holding-leadership.js";
import { computeUnifiedLayout, NODE_DEPARTMENT, NODE_ASSISTANT } from "./unified-layout.js";

const LUKYANOV_DIRECTORATES = [
  "Дирекция по инвестициям",
  "Дирекция по экономике",
  "Дирекция по строительству",
  "Дирекция по финансам и отчетности",
  "Дирекция по проектированию",
];

const KLYUEV_DIRECTORATES = [
  "Дирекция по маркетингу",
  "Дирекция брендинга и коммуникаций",
  "Дирекция по безопасности",
  "Дирекция по продажам",
  "Административно-правовая дирекция",
  "Дирекция по персоналу",
  "Дирекция по информационным технологиям",
];

function makeDirectorate(name, guid = `guid-${name}`) {
  return {
    department_guid: guid,
    department_name: name,
    department_manager: "Руководитель",
    department_manager_position: "Руководитель",
    staffCount: 10,
    vacancyCount: 0,
    totalWithVacancies: 10,
    users: [],
    children: [],
  };
}

function makeAdministration() {
  return {
    department_guid: "admin",
    department_name: "Администрация",
    staffCount: 9,
    vacancyCount: 1,
    totalWithVacancies: 10,
    users: [
      // Лукьянов: несколько записей, основная — «Основное место работы» + sub_level.
      {
        id: "luk-1",
        full_name: "Лукьянов Алексей Александрович",
        email: "laa@legenda-dom.ru",
        position: "Операционный директор /Администрация/",
        rawPosition: "Операционный директор /Администрация/",
        subLevel: Number.MAX_SAFE_INTEGER,
        typeEmployment: "Внешнее совместительство",
        isVacancy: false,
      },
      {
        id: "luk-2",
        full_name: "Лукьянов Алексей Александрович",
        email: "laa@legenda-dom.ru",
        position: "Первый заместитель генерального директора /Администрация/",
        rawPosition: "Первый заместитель генерального директора /Администрация/",
        subLevel: 1.3,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
      // Клюев: основная запись «Генеральный директор /Администрация/», sub_level 1.2.
      {
        id: "klu-1",
        full_name: "Клюев Алексей Васильевич",
        email: "avk@legenda-dom.ru",
        position: "Исполнительный директор /Администрация/",
        rawPosition: "Исполнительный директор /Администрация/",
        subLevel: Number.MAX_SAFE_INTEGER,
        typeEmployment: "Внешнее совместительство",
        isVacancy: false,
      },
      {
        id: "klu-2",
        full_name: "Клюев Алексей Васильевич",
        email: "avk@legenda-dom.ru",
        position: "Генеральный директор /Администрация/",
        rawPosition: "Генеральный директор /Администрация/",
        subLevel: 1.2,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
      // Винник: реальный сотрудник «Администрации».
      {
        id: "vin-1",
        full_name: "Винник Лев Арнольдович",
        email: "l.vinnik@legenda-dom.ru",
        position: "Заместитель генерального директора по развитию",
        rawPosition: "Заместитель генерального директора по развитию",
        subLevel: 2,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
      // Прямые подчинённые Клюева.
      {
        id: "soydan-1",
        full_name: "Сойдан Айкут",
        email: "a.soydan@legenda-dom.ru",
        position: "Управляющий объектами коммерческой недвижимости",
        rawPosition: "Управляющий объектами коммерческой недвижимости",
        subLevel: 4,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
      {
        id: "kirillov-1",
        full_name: "Кириллов Олег Сергеевич",
        email: "o.kirillov@legenda-dom.ru",
        position: "Руководитель направления ИИ-трансформации",
        rawPosition: "Руководитель направления ИИ-трансформации",
        subLevel: 4,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
      // Ассистент Селиванова (задан в config, CR-013 §18).
      {
        id: "volkova-1",
        full_name: "Волкова Алина Викторовна",
        email: "a.volkova@legenda-dom.ru",
        position: "Персональный ассистент /Администрация/",
        rawPosition: "Персональный ассистент /Администрация/",
        subLevel: 6.1,
        typeEmployment: "Основное место работы",
        isVacancy: false,
      },
    ],
    children: [],
  };
}

function makeHoldingRoot() {
  const directorates = [
    ...LUKYANOV_DIRECTORATES.map((name) => makeDirectorate(name)),
    ...KLYUEV_DIRECTORATES.map((name) => makeDirectorate(name)),
    makeDirectorate(
      "Дирекция по развитию и градостроительной подготовке проектов",
      "guid-развитие",
    ),
  ];

  return {
    department_guid: "synthetic-root",
    department_name: "Холдинг LEGENDA",
    department_manager: HOLDING_LEADERSHIP_CONFIG.ceo.name,
    department_manager_position: HOLDING_LEADERSHIP_CONFIG.ceo.title,
    staffCount: directorates.reduce((sum, d) => sum + (d.staffCount || 0), 0),
    vacancyCount: 0,
    totalWithVacancies: directorates.reduce((sum, d) => sum + (d.staffCount || 0), 0),
    users: [],
    children: [makeAdministration(), ...directorates],
  };
}

// Администрация с Лукьяновым только в sourceUsers (дробная занятость count < 1).
function makeHoldingWithFractionalSource() {
  const root = makeHoldingRoot();
  const admin = root.children.find((child) => child.department_name === "Администрация");

  admin.sourceUsers = [
    ...admin.users,
    {
      id: "luk-frac",
      full_name: "Лукьянов Алексей Александрович",
      name: "Лукьянов Алексей Александрович",
      email: "laa@legenda-dom.ru",
      position: "Первый заместитель генерального директора /Администрация/",
      rawPosition: "Первый заместитель генерального директора /Администрация/",
      subLevel: 1.3,
      typeEmployment: "Основное место работы",
      count: 0.02,
      isVacancy: false,
    },
  ];
  // Визуальный users: Лукьянов отсутствует (все его записи count < 1).
  admin.users = admin.users.filter((user) => user.email !== "laa@legenda-dom.ru");
  return root;
}

describe("holding-leadership (CR-013)", () => {
  it("строит проекцию: root + 3 executive-узла, без Администрации как дирекции", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());

    expect(root.department_guid).toBe("synthetic-root");
    expect(root.__holdingPresentation).toBe(true);

    const executives = root.children.filter((child) => child.isHoldingExecutive);
    expect(executives).toHaveLength(3);
    expect(executives.map((e) => e.executiveKey)).toEqual(["lukyanov", "vinnik", "klyuev"]);
    expect(root.children.some((child) => child.department_name === "Администрация")).toBe(false);
  });

  it("executive-узлы получают корректные титулы и записи людей", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const [lukyanov, vinnik, klyuev] = root.children;

    expect(lukyanov.department_manager_position).toBe("Операционный директор Холдинга");
    expect(lukyanov.department_name).toContain("Лукьянов");
    expect(lukyanov.__person).toBeTruthy();
    // Основная запись Лукьянова — «Основное место работы» с заполненным sub_level.
    expect(lukyanov.__person.typeEmployment).toBe("Основное место работы");
    expect(lukyanov.__person.subLevel).toBe(1.3);

    expect(vinnik.department_manager_position).toBe(
      "Заместитель генерального директора по развитию",
    );
    expect(klyuev.department_manager_position).toBe("Исполнительный директор Холдинга");
  });

  it("распределяет дирекции по руководителям (CR-013 §3)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const [lukyanov, vinnik, klyuev] = root.children;

    expect(lukyanov.children.map((d) => d.department_name)).toEqual(LUKYANOV_DIRECTORATES);
    expect(vinnik.children.map((d) => d.department_name)).toEqual([
      "Дирекция по развитию и градостроительной подготовке проектов",
    ]);
    expect(klyuev.children.map((d) => d.department_name)).toEqual(KLYUEV_DIRECTORATES);
  });

  it("прямые подчинённые Клюева (Сойдан, Кириллов) лежат в его users (CR-013 §4, §21)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const klyuev = root.children.find((e) => e.executiveKey === "klyuev");

    const emails = klyuev.users.map((u) => u.email);
    expect(emails).toContain("a.soydan@legenda-dom.ru");
    expect(emails).toContain("o.kirillov@legenda-dom.ru");
  });

  it("ассистент Селиванова привязан явно (CR-013 §18)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());

    expect(root.__assistant).toBeTruthy();
    expect(root.__assistant.email).toBe(HOLDING_LEADERSHIP_CONFIG.ceo.assistantEmail);
    expect(root.__assistant.position).toBe("Персональный ассистент");
  });

  it("не дублирует руководителей из-за совместительств (CR-013 §10, §13)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());

    const execNames = root.children
      .filter((c) => c.isHoldingExecutive)
      .map((c) => c.department_name);
    expect(execNames.filter((name) => name.includes("Лукьянов")).length).toBe(1);
    expect(execNames.filter((name) => name.includes("Клюев")).length).toBe(1);
  });

  it("не мутирует исходное дерево (CR-013 §29)", () => {
    const input = makeHoldingRoot();
    const snapshot = JSON.parse(JSON.stringify(input));

    buildHoldingLeadershipTree(input);

    expect(JSON.stringify(input)).toBe(JSON.stringify(snapshot));
  });

  it("сохраняет численность: executive-узлы не добавляют staffCount (CR-013 §28)", () => {
    const input = makeHoldingRoot();
    const root = buildHoldingLeadershipTree(input);

    expect(root.staffCount).toBe(input.staffCount);
    expect(root.totalWithVacancies).toBe(input.totalWithVacancies);

    const execStaff = root.children.reduce((sum, child) => sum + (child.staffCount || 0), 0);
    expect(execStaff).toBe(0);
  });

  it("формирует initialCollapsedIds: дирекции, но не executive-узлы (CR-013 §22)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());

    const executiveIds = root.children
      .filter((c) => c.isHoldingExecutive)
      .map((c) => c.department_guid);
    expect(root.__initialCollapsedIds.length).toBeGreaterThanOrEqual(13);
    root.__initialCollapsedIds.forEach((id) => {
      expect(executiveIds).not.toContain(id);
    });

    const klyuev = root.children.find((e) => e.executiveKey === "klyuev");
    const itDirectorate = klyuev.children.find(
      (d) => d.department_name === "Дирекция по информационным технологиям",
    );
    expect(root.__initialCollapsedIds).toContain(itDirectorate.department_guid);
  });
});


describe("holding-leadership · layout и fallback (CR-013)", () => {
  it("интегрируется с computeUnifiedLayout: executives row 1, дирекции row 2 (CR-013 §19-20)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const layout = computeUnifiedLayout(root, {
      collapsedIds: new Set(root.__initialCollapsedIds),
    });

    const executives = layout.nodes.filter(
      (node) => node.type === NODE_DEPARTMENT && node.data && node.data.isHoldingExecutive,
    );
    expect(executives).toHaveLength(3);
    executives.forEach((exec) => expect(exec.row).toBe(1));

    // Дирекции (даже свёрнутые) — карточки на строке 2.
    const directorates = layout.nodes.filter(
      (node) =>
        node.type === NODE_DEPARTMENT &&
        node.data &&
        !node.data.isHoldingExecutive &&
        node.row === 2,
    );
    expect(directorates.length).toBeGreaterThanOrEqual(13);

    // Ассистент Селиванова — NODE_ASSISTANT под root.
    const assistantNode = layout.nodes.find((node) => node.type === NODE_ASSISTANT);
    expect(assistantNode).toBeTruthy();
    expect(assistantNode.data.email).toBe(HOLDING_LEADERSHIP_CONFIG.ceo.assistantEmail);
  });

  it("корень без детей не падает (CR-013 Test 4)", () => {
    const root = buildHoldingLeadershipTree({
      department_guid: "synthetic-root",
      department_name: "Холдинг LEGENDA",
      children: [],
    });

    expect(root.__holdingPresentation).toBe(true);
    expect(root.children).toEqual([]);
    expect(Array.isArray(root.__initialCollapsedIds)).toBe(true);
  });

  it("использует fallbackTree для режима Changes (CR-013 §17, §24)", () => {
    const modeRoot = {
      department_guid: "synthetic-root",
      department_name: "Холдинг LEGENDA",
      staffCount: 10,
      users: [],
      children: [makeDirectorate("Дирекция по информационным технологиям", "guid-it")],
    };

    const root = buildHoldingLeadershipTree(modeRoot, { fallbackTree: [makeHoldingRoot()] });

    const executives = root.children.filter((c) => c.isHoldingExecutive);
    expect(executives).toHaveLength(3);

    const klyuev = root.children.find((e) => e.executiveKey === "klyuev");
    expect(klyuev.children.map((d) => d.department_name)).toContain(
      "Дирекция по информационным технологиям",
    );
  });

  it("нераспределённые top-level подразделения выводятся под root (fallback) с warn (CR-013 §15, §26)", () => {
    const input = makeHoldingRoot();
    input.children.push(makeDirectorate("Новая дирекция", "guid-new"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const root = buildHoldingLeadershipTree(input);

    const fallback = root.children.find(
      (child) => !child.isHoldingExecutive && child.department_name === "Новая дирекция",
    );
    expect(fallback).toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Новая дирекция"));

    warnSpy.mockRestore();
  });

  it("collectUsersByEmail собирает записи по email", () => {
    const admin = makeAdministration();
    const byEmail = collectUsersByEmail([admin]);

    expect(byEmail.get("laa@legenda-dom.ru")).toHaveLength(2);
    expect(byEmail.get("avk@legenda-dom.ru")).toHaveLength(2);
    expect(byEmail.has("a.volkova@legenda-dom.ru")).toBe(true);
  });

  it("selectPrimaryRecord отдаёт приоритет «Основному месту работы» и заполненному sub_level", () => {
    const records = [
      { typeEmployment: "Внешнее совместительство", subLevel: Number.MAX_SAFE_INTEGER },
      { typeEmployment: "Основное место работы", subLevel: Number.MAX_SAFE_INTEGER },
    ];
    expect(selectPrimaryRecord(records).typeEmployment).toBe("Основное место работы");

    const withSubLevel = [
      { typeEmployment: "Основное место работы", subLevel: Number.MAX_SAFE_INTEGER },
      { typeEmployment: "Основное место работы", subLevel: 1.3 },
    ];
    expect(selectPrimaryRecord(withSubLevel).subLevel).toBe(1.3);
  });
});


describe("holding-leadership · fix (CR-013_fix)", () => {
  it("executive с дробной занятостью находится через sourceUsers (CR-013_fix Test 1, Test 3)", () => {
    const input = makeHoldingWithFractionalSource();
    const admin = input.children.find((child) => child.department_name === "Администрация");

    // Лукьянов есть в sourceUsers, но отсутствует в users.
    expect(admin.sourceUsers.some((u) => u.email === "laa@legenda-dom.ru")).toBe(true);
    expect(admin.users.some((u) => u.email === "laa@legenda-dom.ru")).toBe(false);

    const root = buildHoldingLeadershipTree(input);
    const lukyanov = root.children.find((exec) => exec.executiveKey === "lukyanov");

    expect(lukyanov).toBeTruthy();
    expect(lukyanov.department_manager_position).toBe("Операционный директор Холдинга");
    expect(lukyanov.__person.count).toBe(0.02);
  });

  it("обычный users не меняется: дробный сотрудник не появляется в employee column (CR-013_fix Test 2)", () => {
    const input = makeHoldingWithFractionalSource();
    const admin = input.children.find((child) => child.department_name === "Администрация");

    expect(admin.sourceUsers.some((u) => u.email === "laa@legenda-dom.ru")).toBe(true);
    expect(admin.users.some((u) => u.email === "laa@legenda-dom.ru")).toBe(false);
  });

  it("fallback на users сохраняется для старых fixtures без sourceUsers (CR-013_fix Test 4)", () => {
    // makeHoldingRoot не имеет sourceUsers — руководители ищутся по users.
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const executives = root.children.filter((exec) => exec.isHoldingExecutive);
    expect(executives).toHaveLength(3);
  });

  it("primary record: «Основное место работы» побеждает, count не обязателен (CR-013_fix Test 5)", () => {
    const records = [
      { typeEmployment: "Основное место работы", subLevel: 1.3, count: 0.02 },
      { typeEmployment: "Внешнее совместительство", subLevel: Number.MAX_SAFE_INTEGER, count: 0.5 },
      { typeEmployment: "Внешнее совместительство", subLevel: Number.MAX_SAFE_INTEGER, count: 1 },
    ];
    const primary = selectPrimaryRecord(records);
    expect(primary.typeEmployment).toBe("Основное место работы");
    expect(primary.count).toBe(0.02);
  });

  it("mapping дирекции по department_guid (CR-013_fix Test 6)", () => {
    const department = {
      department_guid: "0f44f48a-39df-11ea-81f5-000c294addcc",
      department_name: "Дирекция по финансам и отчетности",
    };
    expect(resolveExecutiveKey(department)).toBe("lukyanov");

    // Интеграционно: дирекция с реальным GUID попадает под Лукьянова.
    const input = makeHoldingRoot();
    const finance = input.children.find(
      (d) => d.department_name === "Дирекция по финансам и отчетности",
    );
    finance.department_guid = "0f44f48a-39df-11ea-81f5-000c294addcc";

    const root = buildHoldingLeadershipTree(input);
    const lukyanov = root.children.find((exec) => exec.executiveKey === "lukyanov");
    expect(lukyanov.children.map((d) => d.department_name)).toContain(
      "Дирекция по финансам и отчетности",
    );
  });
});


describe("holding-leadership · fix mapping (CR-013_fix)", () => {
  it("rename department не ломает mapping при сохранении GUID (CR-013_fix Test 7, Test 15)", () => {
    const input = makeHoldingRoot();
    const finance = input.children.find(
      (d) => d.department_name === "Дирекция по финансам и отчетности",
    );
    // Стабильный GUID сохранён, название изменилось.
    finance.department_guid = "0f44f48a-39df-11ea-81f5-000c294addcc";
    finance.department_name = "Дирекция по финансам";

    const root = buildHoldingLeadershipTree(input);
    const lukyanov = root.children.find((exec) => exec.executiveKey === "lukyanov");

    expect(lukyanov.children.map((d) => d.department_name)).toContain("Дирекция по финансам");
    // В карточке используется актуальное название из дерева, а не конфигурационное.
    expect(
      lukyanov.children.some((d) => d.department_name === "Дирекция по финансам и отчетности"),
    ).toBe(false);
  });

  it("name fallback работает, если у configured записи нет id (CR-013_fix Test 8)", () => {
    expect(
      matchesConfiguredDepartment(
        { department_guid: "x", department_name: "Дирекция по проектированию" },
        { name: "Дирекция по проектированию" },
      ),
    ).toBe(true);
    expect(
      matchesConfiguredDepartment(
        { department_guid: "y", department_name: "Другое" },
        { name: "Дирекция по проектированию" },
      ),
    ).toBe(false);
  });

  it("неизвестный GUID и name → дирекция уходит в fallback unassigned (CR-013_fix Test 9)", () => {
    const input = makeHoldingRoot();
    input.children.push({
      department_guid: "unknown-guid-123",
      department_name: "Новая неописанная дирекция",
      staffCount: 5,
      users: [],
      children: [],
    });

    const root = buildHoldingLeadershipTree(input);
    const fallback = root.children.find(
      (child) => !child.isHoldingExecutive && child.department_name === "Новая неописанная дирекция",
    );
    expect(fallback).toBeTruthy();
  });

  it("все пять дирекций Лукьянова распределены под ним (CR-013_fix Test 10)", () => {
    const root = buildHoldingLeadershipTree(makeHoldingRoot());
    const lukyanov = root.children.find((exec) => exec.executiveKey === "lukyanov");

    expect(lukyanov.children.map((d) => d.department_name)).toEqual(LUKYANOV_DIRECTORATES);
  });

  it("несколько source-записей одного email дают одну executive card (CR-013_fix Test 11)", () => {
    const input = makeHoldingRoot();
    const admin = input.children.find((child) => child.department_name === "Администрация");
    admin.sourceUsers = [
      ...admin.users,
      { id: "luk-a", full_name: "Лукьянов Алексей Александрович", email: "laa@legenda-dom.ru", position: "Операционный директор", rawPosition: "Операционный директор", subLevel: Number.MAX_SAFE_INTEGER, typeEmployment: "Внешнее совместительство", count: 0.1, isVacancy: false },
      { id: "luk-b", full_name: "Лукьянов Алексей Александрович", email: "laa@legenda-dom.ru", position: "Операционный директор", rawPosition: "Операционный директор", subLevel: Number.MAX_SAFE_INTEGER, typeEmployment: "Внешнее совместительство", count: 0.5, isVacancy: false },
    ];

    const root = buildHoldingLeadershipTree(input);
    const lukyanov = root.children.filter((exec) => exec.executiveKey === "lukyanov");
    expect(lukyanov).toHaveLength(1);
  });

  it("исходное дерево не мутируется при работе со sourceUsers (CR-013_fix §18)", () => {
    const input = makeHoldingWithFractionalSource();
    const snapshot = JSON.parse(JSON.stringify(input));

    buildHoldingLeadershipTree(input);

    expect(JSON.stringify(input)).toBe(JSON.stringify(snapshot));
  });
});

