import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем глобальный fetch перед импортом модуля
const mockFetch = vi.fn();

// Импортируем после мока
const { fetchOrganizationStructure } = await import('./api.js');

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
          employees: [],
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
});