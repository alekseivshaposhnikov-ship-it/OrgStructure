import { describe, it, expect, beforeEach } from "vitest";
import {
  initEmployeeModal,
  openEmployeeDetails,
  closeEmployeeDetails,
} from "./employee-modal.js";

describe("employee-modal (Фаза 5)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="employeeModal" class="hidden">
        <button id="closeEmployeeModal"></button>
        <div class="employee-modal__backdrop"></div>
        <div id="employeeDetails"></div>
      </div>
    `;
  });

  function makeEmployee(overrides = {}) {
    return {
      name: "Иван Иванов",
      position: "Разработчик",
      project: "Проект А",
      phone: "+7 123",
      email: "ivan@example.ru",
      typeEmployment: "Полная",
      state: "Активен",
      ...overrides,
    };
  }

  it("openEmployeeDetails должен заполнять данные и открывать модалку", () => {
    openEmployeeDetails(makeEmployee());

    const modal = document.getElementById("employeeModal");
    const details = document.getElementById("employeeDetails");

    expect(modal.classList.contains("hidden")).toBe(false);
    expect(details.textContent).toContain("Иван Иванов");
    expect(details.textContent).toContain("Разработчик");
    expect(details.textContent).toContain("ivan@example.ru");
  });

  it("closeEmployeeDetails должен скрывать модалку", () => {
    openEmployeeDetails(makeEmployee());
    closeEmployeeDetails();

    expect(document.getElementById("employeeModal").classList.contains("hidden")).toBe(true);
  });

  it("initEmployeeModal должен подключать обработчики закрытия", () => {
    initEmployeeModal();

    openEmployeeDetails(makeEmployee());
    document.getElementById("closeEmployeeModal").click();
    expect(document.getElementById("employeeModal").classList.contains("hidden")).toBe(true);

    openEmployeeDetails(makeEmployee());
    document.querySelector(".employee-modal__backdrop").click();
    expect(document.getElementById("employeeModal").classList.contains("hidden")).toBe(true);
  });

  it("должен экранировать HTML в полях", () => {
    openEmployeeDetails(makeEmployee({ name: "<script>alert(1)</script>" }));

    const details = document.getElementById("employeeDetails");
    expect(details.querySelector("script")).toBeNull();
    expect(details.textContent).toContain("<script>alert(1)</script>");
  });
});
