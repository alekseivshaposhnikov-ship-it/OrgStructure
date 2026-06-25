import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initChangelog } from './changelog.js';

describe('changelog.js', () => {
  beforeEach(() => {
    const store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => store[key] ?? null),
      setItem: vi.fn((key, value) => { store[key] = value; }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
      length: 0,
      key: vi.fn(),
    });

    document.body.innerHTML = `
      <button id="openChangelog">Что нового</button>
      <span id="changelogBadge" class="hidden">NEW</span>
      <div id="changelogModal" class="hidden">
        <button id="closeChangelogModal">×</button>
        <div id="changelogContent"></div>
        <span id="changelogLatestVersion"></span>
        <span data-close-changelog>Закрыть</span>
      </div>
    `;
  });

  it('должен рендерить changelog и latestVersion', () => {
    initChangelog();

    const content = document.getElementById('changelogContent');
    expect(content.innerHTML).not.toBe('');
    expect(content.innerHTML).toContain('1.6.0');

    const latestVersion = document.getElementById('changelogLatestVersion');
    expect(latestVersion.textContent).toContain('1.6.0');
  });

  it('должен отображать badge для непросмотренной версии', () => {
    initChangelog();

    const badge = document.getElementById('changelogBadge');
    expect(badge.classList.contains('hidden')).toBe(false);
  });

  it('должен скрывать badge после открытия модалки', () => {
    initChangelog();

    const openButton = document.getElementById('openChangelog');
    openButton.click();

    const badge = document.getElementById('changelogBadge');
    expect(badge.classList.contains('hidden')).toBe(true);
  });

  it('должен сохранять последнюю просмотренную версию в localStorage при открытии', () => {
    initChangelog();

    const openButton = document.getElementById('openChangelog');
    openButton.click();

    expect(localStorage.setItem).toHaveBeenCalledWith('orgAppLastSeenVersion', '1.6.0');
  });

  it('должен скрывать badge если версия уже просмотрена', () => {
    localStorage.setItem('orgAppLastSeenVersion', '1.6.0');

    initChangelog();

    const badge = document.getElementById('changelogBadge');
    expect(badge.classList.contains('hidden')).toBe(true);
  });

  it('должен открывать и закрывать модалку', () => {
    initChangelog();

    const modal = document.getElementById('changelogModal');
    expect(modal.classList.contains('hidden')).toBe(true);

    document.getElementById('openChangelog').click();
    expect(modal.classList.contains('hidden')).toBe(false);

    document.getElementById('closeChangelogModal').click();
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  it('должен закрывать модалку по data-close-changelog', () => {
    initChangelog();

    const modal = document.getElementById('changelogModal');
    document.getElementById('openChangelog').click();
    expect(modal.classList.contains('hidden')).toBe(false);

    document.querySelector('[data-close-changelog]').click();
    expect(modal.classList.contains('hidden')).toBe(true);
  });
});