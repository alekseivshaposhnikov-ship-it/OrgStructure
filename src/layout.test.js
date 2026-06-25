import { describe, it, expect } from 'vitest';
import { addLevels, flattenTree } from './layout.js';

describe('layout.js', () => {
  describe('addLevels', () => {
    it('должен проставлять level=0 для корневых узлов', () => {
      const tree = [{ name: 'A', children: [] }];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
    });

    it('должен увеличивать level для вложенных узлов', () => {
      const tree = [{ name: 'A', children: [{ name: 'B', children: [] }] }];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
      expect(tree[0].children[0].level).toBe(1);
    });

    it('должен корректно работать с глубиной 2+', () => {
      const tree = [
        {
          name: 'A',
          children: [
            {
              name: 'B',
              children: [{ name: 'C', children: [] }],
            },
          ],
        },
      ];
      addLevels(tree);
      expect(tree[0].level).toBe(0);
      expect(tree[0].children[0].level).toBe(1);
      expect(tree[0].children[0].children[0].level).toBe(2);
    });

    it('не должен падать на пустом массиве', () => {
      expect(() => addLevels([])).not.toThrow();
    });

    it('не должен падать на узлах без children', () => {
      const tree = [{ name: 'A' }];
      expect(() => addLevels(tree)).not.toThrow();
      expect(tree[0].level).toBe(0);
    });
  });

  describe('flattenTree', () => {
    it('должен возвращать все узлы в плоском массиве', () => {
      const tree = [
        {
          name: 'A',
          children: [
            { name: 'B', children: [{ name: 'C', children: [] }] },
          ],
        },
      ];
      const flat = flattenTree(tree);
      expect(flat).toHaveLength(3);
      expect(flat[0].name).toBe('A');
      expect(flat[1].name).toBe('B');
      expect(flat[2].name).toBe('C');
    });

    it('должен соблюдать порядок DFS (сначала родитель, потом дети)', () => {
      const tree = [
        {
          name: 'A',
          children: [
            { name: 'B', children: [] },
            { name: 'C', children: [] },
          ],
        },
      ];
      const flat = flattenTree(tree);
      expect(flat[0].name).toBe('A');
      expect(flat[1].name).toBe('B');
      expect(flat[2].name).toBe('C');
    });

    it('должен возвращать пустой массив для пустого входа', () => {
      expect(flattenTree([])).toEqual([]);
    });

    it('должен работать с несколькими корнями', () => {
      const tree = [
        { name: 'A', children: [{ name: 'A1', children: [] }] },
        { name: 'B', children: [] },
      ];
      const flat = flattenTree(tree);
      expect(flat).toHaveLength(3);
    });
  });
});