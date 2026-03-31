import { buildTree } from "./src/tree.js";
import PPTXGenJS from "pptxgenjs";

let rawData = [];      // все отделы
let filteredData = []; // после фильтра

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

    // Берём массив departments
    rawData = parsed.departments || [];
    console.log("Departments loaded:", rawData.length);

    filteredData = rawData;
    renderTree();

  } catch (err) {
    console.error("Ошибка загрузки JSON:", err);
    alert("Не удалось прочитать JSON");
  }
});

filterBtn.addEventListener("click", () => {
  const keyword = filterDept.value.trim().toLowerCase();
  if (!keyword) {
    filteredData = rawData;
  } else {
    filteredData = rawData.filter(d => d.department_name.toLowerCase().includes(keyword));
  }
  renderTree();
});

exportBtn.addEventListener("click", () => {
  if (!filteredData.length) return alert("Нет данных для экспорта");

  const pptx = new PPTXGenJS();
  const slide = pptx.addSlide();
  
  let y = 0.5;
  filteredData.forEach(d => {
    const text = `${d.department_name} (${d.user_count} чел.)\nРуководитель: ${d.department_manager}`;
    slide.addText(text, { x: 0.5, y, w: 9, h: 0.5, fontSize: 12 });
    y += 0.7;
  });

  pptx.writeFile({ fileName: "OrgStructure.pptx" });
});

// Рендерим дерево на странице
function renderTree() {
  const container = document.getElementById("tree");
  container.innerHTML = "";
  const tree = buildTree(filteredData);
  container.appendChild(tree);
}