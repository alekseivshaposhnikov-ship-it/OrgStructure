import { buildTree, collectSubDepartments, getTopLevelDepartments, attachUsersToDepartments } from './src/tree.js';
import { renderTree } from './src/render.js';
import { exportToPptx } from './src/pptx.js';
import { exportToDrawio } from './src/drawio.js';   // <-- новая строка


let treeData = [];
let fullTree = [];
let usersData = [];

const fileInput = document.getElementById('fileInput');
const usersInput = document.getElementById('usersInput');
const departmentSelect = document.getElementById('departmentSelect');
const treeContainer = document.getElementById('treeContainer');
const showAllCheckbox = document.getElementById('showAll');
const exportBtn = document.getElementById('exportPptx');
const exportDrawioBtn = document.getElementById('exportDrawio'); // <-- новая строка

/* … остальной код без изменений … */

// *** Удалён устаревший обработчик exportPptxBtn (был дублирующим) ***
// Экспорт в PPTX теперь обрабатывается единственным обработчиком ниже (exportBtn).
// **Новый обработчик – экспорт в draw.io**
exportDrawioBtn.addEventListener('click', () => {
    const selectedGuid = departmentSelect.value;
    let nodesToExport = [];

    if (selectedGuid) {
        const selectedNode = findNodeByGuid(fullTree, selectedGuid);
        if (selectedNode) {
            nodesToExport = collectSubDepartments(selectedNode);
        }
    } else if (!showAllCheckbox.checked) {
        getTopLevelDepartments(fullTree).forEach(node => {
            nodesToExport = nodesToExport.concat(collectSubDepartments(node));
        });
    } else {
        fullTree.forEach(node => {
            nodesToExport = nodesToExport.concat(collectSubDepartments(node));
        });
    }

    exportToDrawio(nodesToExport);   // <-- единственная строка, вызывающая наш модуль
});

// Загрузка дерева департаментов
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const json = JSON.parse(text);

    treeData = json.departments;
    fullTree = buildTree(treeData);

    // Если уже есть пользователи — прикрепляем
    if (usersData.length > 0) {
        attachUsersToDepartments(fullTree, usersData);
    }

    populateDepartmentSelect();
    updateTree();
});

// Загрузка пользователей
usersInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const json = JSON.parse(text);

    usersData = json.users || [];

    if (fullTree.length > 0) {
        attachUsersToDepartments(fullTree, usersData);
        updateTree();
    }
});

// Заполняем select только верхними уровнями
function populateDepartmentSelect() {
    departmentSelect.innerHTML = '<option value="">-- Выберите департамент --</option>';
    const topLevel = getTopLevelDepartments(fullTree);
    topLevel.forEach(d => {
        const option = document.createElement('option');
        option.value = d.department_guid;
        option.textContent = d.department_name;
        departmentSelect.appendChild(option);
    });
}

// Находим узел по GUID
function findNodeByGuid(nodes, guid) {
    for (const node of nodes) {
        if (node.department_guid === guid) return node;
        if (node.children && node.children.length > 0) {
            const found = findNodeByGuid(node.children, guid);
            if (found) return found;
        }
    }
    return null;
}

// Обновляем отображение дерева
function updateTree() {
    let nodesToRender = fullTree;

    const selectedGuid = departmentSelect.value;
    if (selectedGuid) {
        const selectedNode = findNodeByGuid(fullTree, selectedGuid);
        if (selectedNode) {
            nodesToRender = [selectedNode];
        }
    } else if (!showAllCheckbox.checked) {
        nodesToRender = getTopLevelDepartments(fullTree);
    }

    renderTree(nodesToRender, treeContainer);
}

// События
departmentSelect.addEventListener('change', updateTree);
showAllCheckbox.addEventListener('change', updateTree);

// Экспорт PPTX – единственный обработчик
exportBtn.addEventListener('click', () => {
    const selectedGuid = departmentSelect.value;
    let nodesToExport = [];

    if (selectedGuid) {
        const selectedNode = findNodeByGuid(fullTree, selectedGuid);
        if (selectedNode) {
            nodesToExport = collectSubDepartments(selectedNode);
        }
    } else if (!showAllCheckbox.checked) {
        getTopLevelDepartments(fullTree).forEach(node => {
            nodesToExport = nodesToExport.concat(collectSubDepartments(node));
        });
    } else {
        fullTree.forEach(node => {
            nodesToExport = nodesToExport.concat(collectSubDepartments(node));
        });
    }

    exportToPptx(nodesToExport);
});