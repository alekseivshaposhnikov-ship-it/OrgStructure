// src/employee-modal.js

export function initEmployeeModal() {
  document
    .getElementById("closeEmployeeModal")
    ?.addEventListener("click", closeEmployeeDetails);

  document
    .querySelector(".employee-modal__backdrop")
    ?.addEventListener("click", closeEmployeeDetails);
}

export function openEmployeeDetails(employee) {
  const modal = document.getElementById("employeeModal");
  const details = document.getElementById("employeeDetails");

  if (!modal || !details) return;

  details.innerHTML = `
    <div class="employee-details">
      ${
        employee.photo
          ? `
            <img
              class="employee-details__photo"
              src="${escapeHtml(employee.photo)}"
              alt="${escapeHtml(employee.name || "")}"
            />
          `
          : `
            <div class="employee-details__photo employee-details__photo--empty">
              👤
            </div>
          `
      }

      <h2>
        ${escapeHtml(
          employee.name ||
          employee.full_name ||
          "Сотрудник"
        )}
      </h2>

      ${
        employee.position
          ? `<p><b>Должность:</b> ${escapeHtml(employee.position)}</p>`
          : ""
      }

      ${
        employee.project
          ? `<p><b>Проект:</b> ${escapeHtml(employee.project)}</p>`
          : ""
      }

      ${
        employee.phone
          ? `<p><b>Телефон:</b> ${escapeHtml(employee.phone)}</p>`
          : ""
      }

      ${
        employee.email
          ? `
            <p>
              <b>Email:</b>
              <a href="mailto:${escapeHtml(employee.email)}">
                ${escapeHtml(employee.email)}
              </a>
            </p>
          `
          : ""
      }

      ${
        employee.typeEmployment
          ? `<p><b>Тип занятости:</b> ${escapeHtml(employee.typeEmployment)}</p>`
          : ""
      }

      ${
        employee.state
          ? `<p><b>Статус:</b> ${escapeHtml(employee.state)}</p>`
          : ""
      }
    </div>
  `;

  modal.classList.remove("hidden");
}

export function closeEmployeeDetails() {
  document
    .getElementById("employeeModal")
    ?.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}