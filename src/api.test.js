import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем глобальный fetch перед импортом модуля
const mockFetch = vi.fn();

// Импортируем после мока
const {
  fetchOrganizationStructure,
  filterExcludedDepartments,
  filterEmptyDepartments,
  applyRenames,
} = await import('./api.js');

describe('api.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('alert', vi.fn());
    mockFetch.mockReset();
  });

  describe('fetchOrganizationStructure', () => {
    it('должен успешно загружать и трансформировать данные', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел разработки',
          manager: { id: 'mgr-1', full_name: 'Иван Иванов', position: 'Руководитель отдела' },
          employees: [
            { id: 'emp-1', full_name: 'Петр Петров', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [
            { id: 'vac-1', position: 'Программист' },
          ],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result).toHaveLength(1);
      expect(result[0].department_guid).toBe('dept-1');
      expect(result[0].department_name).toBe('Отдел разработки');
      expect(result[0].staffCount).toBe(1);
      expect(result[0].vacancyCount).toBe(1);
      expect(result[0].totalWithVacancies).toBe(2);
    });

    it('должен сохранять sub_level руководителя', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: {
            id: 'mgr-1',
            full_name: 'Иван Иванов',
            position: 'Руководитель',
            sub_level: '2.0',
          },
          employees: [
            { id: 'emp-1', full_name: 'Петр Петров', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].manager_sub_level).toBe(2);
    });

    it('должен ставить MAX_SAFE_INTEGER при отсутствии sub_level у руководителя', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { id: 'mgr-1', full_name: 'Иван Иванов', position: 'Руководитель' },
          employees: [
            { id: 'emp-1', full_name: 'Петр Петров', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].manager_sub_level).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('должен брать sub_level из employees, если у manager.sub_level нет (кейс Зуевой)', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел клиентского сопровождения',
          manager: {
            full_name: 'Зуева Наталья Сергеевна',
            position: 'Руководитель отдела',
            projects: ''
          },
          employees: [
            {
              full_name: 'Зуева Наталья Сергеевна',
              position: 'Руководитель отдела',
              sub_level: '4.0',
              count: '1'
            }
          ],
          vacancy_list: [],
          children: []
        }
      ];

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(apiResponse) });

      const result = await fetchOrganizationStructure();
      expect(result[0].manager_sub_level).toBe(4);
      expect(result[0].users).toHaveLength(0);
    });

    it('должен сопоставлять руководителя и сотрудника по id', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { id: 'mgr-99', full_name: 'Мария Смирнова', position: 'Руководитель' },
          employees: [
            { id: 'mgr-99', full_name: 'Мария Смирнова', position: 'Руководитель', sub_level: '3.5', count: '1' },
            { id: 'emp-1', full_name: 'Петр Петров', position: 'Разработчик', count: '1' }
          ],
          vacancy_list: [],
          children: []
        }
      ];

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(apiResponse) });

      const result = await fetchOrganizationStructure();
      expect(result[0].manager_sub_level).toBe(3.5);
    });

    it('должен сопоставлять руководителя по full_name (trim, без учета регистра)', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { full_name: '  Анна Орлова ', position: 'Руководитель' },
          employees: [
            { full_name: 'АННА ОРЛОВА', position: 'Руководитель', sub_level: '5.0', count: '1' }
          ],
          vacancy_list: [],
          children: []
        }
      ];

      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(apiResponse) });

      const result = await fetchOrganizationStructure();
      expect(result[0].manager_sub_level).toBe(5);
    });

    it('должен возвращать пустой массив при HTTP ошибке', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchOrganizationStructure();
      expect(result).toEqual([]);
    });

    it('должен возвращать пустой массив при сетевой ошибке', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchOrganizationStructure();
      expect(result).toEqual([]);
    });

    it('должен трансформировать пустой массив', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const result = await fetchOrganizationStructure();
      expect(result).toEqual([]);
    });

    it('должен исключать руководителя из списка сотрудников (по id)', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { id: 'emp-1', full_name: 'Иван Иванов', position: 'Руководитель' },
          employees: [
            { id: 'emp-1', full_name: 'Иван Иванов', position: 'Руководитель', count: '1' },
            { id: 'emp-2', full_name: 'Петр Петров', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      const users = result[0].users;
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe('emp-2');
    });

    it('должен исключать руководителя из списка сотрудников (по full_name)', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { id: 'mgr-1', full_name: 'Иван Иванов', position: 'Руководитель' },
          employees: [
            { id: 'emp-1', full_name: 'ИВАН ИВАНОВ', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].users).toHaveLength(0);
    });

    it('должен фильтровать сотрудников с count < 1', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: null,
          employees: [
            { id: 'emp-1', full_name: 'Петр', position: 'Разраб', count: '0.5' },
            { id: 'emp-2', full_name: 'Иван', position: 'Тестировщик', count: '2' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      const users = result[0].users;
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe('emp-2');
    });

    it('должен корректно парсить sub_level с запятой', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: null,
          employees: [{ id: 'emp-1', full_name: 'Петр', position: 'Разраб', count: '1', sub_level: '1,5' }],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].users[0].subLevel).toBe(1.5);
    });

    it('должен устанавливать subLevel в MAX_SAFE_INTEGER при отсутствии', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: null,
          employees: [{ id: 'emp-1', full_name: 'Петр', position: 'Разраб', count: '1' }],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].users[0].subLevel).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('должен корректно обрабатывать вложенные подразделения', async () => {
      const apiResponse = [
        {
          id: 'dept-root',
          name: 'Холдинг',
          manager: null,
          employees: [],
          vacancy_list: [],
          children: [
            {
              id: 'dept-sub',
              name: 'Подразделение',
              manager: null,
              employees: [{ id: 'emp-1', full_name: 'Петр', position: 'Разраб', count: '1' }],
              vacancy_list: [],
              children: [],
            },
          ],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].parent_guid).toBe('dept-root');
      expect(result[0].staffCount).toBe(1);
    });

    it('должен создавать вакансии с isVacancy=true', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: null,
          employees: [],
          vacancy_list: [{ id: 'vac-1', position: 'Программист' }],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].users[0].isVacancy).toBe(true);
      expect(result[0].users[0].full_name).toBe('Вакансия');
    });

    it('должен сокращать должность по символу "/"', async () => {
      const apiResponse = [
        {
          id: 'dept-1',
          name: 'Отдел',
          manager: { id: 'mgr-1', full_name: 'Иван', position: 'Руководитель отдела / Юридический департамент' },
          employees: [
            { id: 'emp-1', full_name: 'Петр Петров', position: 'Разработчик', count: '1' },
          ],
          vacancy_list: [],
          children: [],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      });

      const result = await fetchOrganizationStructure();
      expect(result[0].department_manager_position).toBe('Руководитель отдела');
    });
  });

  describe('filterExcludedDepartments', () => {
    it('должен удалять подразделение «Администрация+»', () => {
      const tree = [
        {
          department_guid: 'dept-1',
          department_name: 'Отдел продаж',
          children: [],
        },
        {
          department_guid: 'dept-admin',
          department_name: 'Администрация+',
          children: [],
        },
      ];

      const result = filterExcludedDepartments(tree);
      expect(result).toHaveLength(1);
      expect(result[0].department_name).toBe('Отдел продаж');
    });

    it('должен рекурсивно удалять «Администрация+» из дочерних узлов', () => {
      const tree = [
        {
          department_guid: 'root',
          department_name: 'Холдинг',
          children: [
            {
              department_guid: 'admin',
              department_name: 'Администрация+',
              children: [],
            },
            {
              department_guid: 'dept-ok',
              department_name: 'Отдел кадров',
              children: [],
            },
          ],
        },
      ];

      const result = filterExcludedDepartments(tree);
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].department_name).toBe('Отдел кадров');
    });

    it('должен удалять всё поддерево исключённого подразделения', () => {
      const tree = [
        {
          department_guid: 'admin',
          department_name: 'Администрация+',
          children: [
            {
              department_guid: 'sub',
              department_name: 'Подотдел',
              children: [],
            },
          ],
          users: [{ id: 'u1', full_name: 'Сотрудник' }],
        },
      ];

      const result = filterExcludedDepartments(tree);
      expect(result).toHaveLength(0);
    });

    it('должен корректно работать с пустым массивом', () => {
      expect(filterExcludedDepartments([])).toEqual([]);
      expect(filterExcludedDepartments(null)).toEqual([]);
    });
  });

  describe('filterEmptyDepartments', () => {
    it('должен удалять подразделения без сотрудников и вакансий', () => {
      const tree = [
        {
          department_guid: 'empty',
          department_name: 'Пустой отдел',
          staffCount: 0,
          vacancyCount: 0,
          users: [],
          children: [],
        },
      ];

      const result = filterEmptyDepartments(tree);
      expect(result).toHaveLength(0);
    });

    it('должен сохранять подразделения с сотрудниками', () => {
      const tree = [
        {
          department_guid: 'has-staff',
          department_name: 'Отдел',
          staffCount: 5,
          vacancyCount: 0,
          users: [],
          children: [],
        },
      ];

      const result = filterEmptyDepartments(tree);
      expect(result).toHaveLength(1);
    });

    it('должен сохранять подразделения с вакансиями', () => {
      const tree = [
        {
          department_guid: 'has-vac',
          department_name: 'Отдел',
          staffCount: 0,
          vacancyCount: 3,
          users: [],
          children: [],
        },
      ];

      const result = filterEmptyDepartments(tree);
      expect(result).toHaveLength(1);
    });

    it('должен сохранять подразделение с непустыми дочерними узлами', () => {
      const tree = [
        {
          department_guid: 'parent',
          department_name: 'Родительский',
          staffCount: 0,
          vacancyCount: 0,
          users: [],
          children: [
            {
              department_guid: 'child',
              department_name: 'Дочерний',
              staffCount: 2,
              vacancyCount: 0,
              users: [],
              children: [],
            },
          ],
        },
      ];

      const result = filterEmptyDepartments(tree);
      expect(result).toHaveLength(1);
      expect(result[0].department_name).toBe('Родительский');
      expect(result[0].children).toHaveLength(1);
    });

    it('должен корректно работать с пустым массивом', () => {
      expect(filterEmptyDepartments([])).toEqual([]);
      expect(filterEmptyDepartments(null)).toEqual([]);
    });
  });

  describe('applyRenames', () => {
    it('должен переименовывать «Дирекция по эксплуатации» в «LEGENDA Comfort»', () => {
      const node = {
        department_guid: 'd1',
        department_name: 'Дирекция по эксплуатации',
        children: [],
      };

      const result = applyRenames(node);
      expect(result.department_name).toBe('LEGENDA Comfort');
    });

    it('должен рекурсивно переименовывать вложенные узлы', () => {
      const tree = {
        department_guid: 'root',
        department_name: 'Холдинг',
        children: [
          {
            department_guid: 'd1',
            department_name: 'Дирекция по эксплуатации',
            children: [
              {
                department_guid: 'd2',
                department_name: 'Дирекция по эксплуатации',
                children: [],
              },
            ],
          },
        ],
      };

      const result = applyRenames(tree);
      expect(result.department_name).toBe('Холдинг');
      expect(result.children[0].department_name).toBe('LEGENDA Comfort');
      expect(result.children[0].children[0].department_name).toBe('LEGENDA Comfort');
    });

    it('не должен менять названия других подразделений', () => {
      const node = {
        department_guid: 'd1',
        department_name: 'Отдел разработки',
        children: [],
      };

      const result = applyRenames(node);
      expect(result.department_name).toBe('Отдел разработки');
    });

    it('должен корректно работать с null', () => {
      expect(applyRenames(null)).toBeNull();
    });
  });
});
