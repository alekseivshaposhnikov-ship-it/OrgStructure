import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderChangesBadge,
  openChangesPanel,
  closeChangesPanel,
  toggleChangesPanel,
  renderChangesList,
} from "./changes-panel.js";

function makeScenario(operations = []) {
  return { baseTree: [], workingTree: [], operations };
}

describe("changes-panel overlay (CR-024 §3)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="changesToggle" class="hidden"></button>
      <aside id="changesPanel" class="hidden">
        <span id="changesCount">0</span>
        <div id="changesList"></div>
      </aside>
    `;
  });

  it("без изменений кнопка и панель скрыты", () => {
    renderChangesBadge(0);
    expect(document.getElementById("changesToggle").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(true);
  });

  it("при наличии изменений кнопка со счётчиком показана, панель закрыта", () => {
    renderChangesBadge(3);
    const toggle = document.getElementById("changesToggle");
    expect(toggle.classList.contains("hidden")).toBe(false);
    expect(toggle.textContent).toBe("Изменения · 3");
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(true);
  });

  it("последнее изменение отменено → панель автоматически закрывается и кнопка исчезает", () => {
    openChangesPanel();
    renderChangesBadge(0);
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("changesToggle").classList.contains("hidden")).toBe(true);
  });

  it("open/close/toggle управляют панелью без потери данных", () => {
    renderChangesList(makeScenario([{ id: "op1", type: "addDepartment", entityId: "d1", title: "Отдел" }]));

    openChangesPanel();
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(false);

    closeChangesPanel();
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(true);
    // Данные в списке сохранились.
    expect(document.querySelectorAll(".change-item").length).toBe(1);

    toggleChangesPanel();
    expect(document.getElementById("changesPanel").classList.contains("hidden")).toBe(false);
  });

  it("renderChangesList обновляет кнопку-счётчик и не падает без панели", () => {
    const onFocus = vi.fn();
    renderChangesList(makeScenario([{ id: "op1", type: "addEmployee", entityId: "e1", title: "Иван" }]), onFocus);

    expect(document.getElementById("changesToggle").textContent).toBe("Изменения · 1");

    document.querySelector(".change-item").click();
    expect(onFocus).toHaveBeenCalledWith("e1");
  });
});
