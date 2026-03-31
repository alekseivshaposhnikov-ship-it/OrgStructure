import { buildTree } from "./src/tree.js";
import PPTXGenJS from "pptxgenjs";

let rawData = [];
let filteredData = [];

const fileInput = document.getElementById("fileInput");
const filterBtn = document.getElementById("filterBtn");
const exportBtn = document.getElementById("exportBtn");
const filterDept = document.getElementById("filterDept");

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    rawData = parsed.departments || [];
    console.log("Departments loaded:", rawData.length);

    populateFilterSelect(); // наполняем выпадающий список
    filteredData = rawData;
    renderTree();

  } catch (err) {
    console.error("Ошибка загрузки JSON:", err);
    alert("Не удалось прочитать JSON");
  }
});

// Наполняем select реальными департаментами
function populateFilterSelect() {
  const uniqueDepts = [...new Map(rawData.map(d => [d.department_guid, d.department_name])).values()];
  filterDept.innerHTML = `<option value="">-- Все департаменты --</option>`;
  rawData.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.department_guid;
    opt.textContent = d.department_name;
    filterDept.appendChild(opt);
  });
}

// Фильтрация по выбранному департаменту и его подчиненным
filterBtn.addEventListener("click", () => {
  const selectedGuid = filterDept.value;
  if (!selectedGuid) {
    filteredData = rawData;
  } else {
    filteredData = getSubtree(rawData, selectedGuid);
  }
  renderTree();
});

// Экспорт в PPTX
exportBtn.addEventListener("click", () => {
  if (!filteredData.length) return alert("Нет данных для экспорта");

  const pptx = new PPTXGenJS();
  const slide = pptx.addSlide();

  let y = 0.5;
  filteredData.forEach(d => {
    const text = `${d.department_name} (${d.user_count} чел.)\nРуководитель: ${d.department_manager || "-"}`;
    slide.addText(text, { x: 0.5, y, w: 9, h: 0.5, fontSize: 12 });
    y += 0.7;
  });

  pptx.writeFile({ fileName: "OrgStructure.pptx" });
});

// Рендерим дерево
function renderTree() {
  const container = document.getElementById("tree");
  container.innerHTML = "";
  const tree = buildTree(filteredData);
  container.appendChild(tree);
}

// Получаем выбранный департамент и все его подчиненные (рекурсивно)
function getSubtree(data, rootGuid) {
  const map = {};
  data.forEach(d => map[d.department_guid] = { ...d, children: [] });

  data.forEach(d => {
    if (d.parent_guid && map[d.parent_guid]) {
      map[d.parent_guid].children.push(map[d.department_guid]);
    }
  });

  function collect(dep) {
    let res = [dep];
    dep.children.forEach(c => res = res.concat(collect(c)));
    return res;
  }

  if (!map[rootGuid]) return [];
  return collect(map[rootGuid]);
}