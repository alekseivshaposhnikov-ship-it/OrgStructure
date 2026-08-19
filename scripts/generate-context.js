/**
 * generate-context.js
 *
 * Генерирует project-context.txt — конкатенацию исходных файлов проекта
 * для быстрой передачи контекста (LLM/внешние инструменты).
 *
 * Запуск: node scripts/generate-context.js
 * Файл намеренно исключён из git (см. .gitignore: project-context.txt).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXTS = [
  '.js',
  '.ts',
  '.vue',
  '.json',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.env'
];

const IGNORE = [
  'node_modules',
  'dist',
  'docs',
  'coverage',
  '.git',
  '.nuxt',
  '.output',
  '.idea',
  '.vscode'
];

const IGNORE_FILES = [
  'getDepartmentHierarchy.json',
  'getUsersData.json',
  'package-lock.json'
];

let output = '';

function walk(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    // игнор конкретных файлов
    if (IGNORE_FILES.includes(file)) {
      continue;
    }

    const full = path.join(dir, file);

    if (IGNORE.some(i => full.includes(i))) {
      continue;
    }

    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      walk(full);
    } else {
      const ext = path.extname(full);

      const allowed =
        EXTS.includes(ext) ||
        file === 'package.json' ||
        file === 'vite.config.js' ||
        file === 'vite.config.ts';

      if (allowed) {
        output += `\n\n# FILE: ${full}\n\n`;

        try {
          output += fs.readFileSync(full, 'utf8');
        } catch {
          output += '[READ ERROR]';
        }
      }
    }
  }
}

walk(ROOT);

fs.writeFileSync(path.join(ROOT, 'project-context.txt'), output);

console.log('Done: project-context.txt');
