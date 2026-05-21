import fs from 'fs';
import path from 'path';

const ROOT = './';

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
  '.git',
  '.nuxt',
  '.output',
  '.idea',
  '.vscode',
  'coverage'
];

const IGNORE_FILES = [
  'getDepartmentHierarchy.json',
  'getUsersData.json'
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
        } catch (e) {
          output += '[READ ERROR]';
        }
      }
    }
  }
}

walk(ROOT);

fs.writeFileSync('project-context.txt', output);

console.log('Done');