import { buildTree, renderTree, collectSubDepartments, getTopLevelDepartments } from './src/tree.js';
import { exportToPptx } from './src/pptx.js';

let treeData = [];
let fullTree = [];

const fileInput = document.getElementById('fileInput');
const departmentSelect = document.getElementById('departmentSelect');
const treeContainer = document.getElementById('treeContainer');
const showAllCheckbox = document.getElementById('showAll');
const exportBtn = document.getElementById('exportPptx');

// Пользователь выбирает JSON файл
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const json = JSON.parse(text);

    treeData = json.departments;
    fullTree = buildTree(treeData);

    populateDepartmentSelect();
    updateTree();
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

// Обновляем отображение дерева
function updateTree() {
    let nodesToRender = fullTree;

    if (!showAllCheckbox.checked) {
        nodesToRender = getTopLevelDepartments(fullTree);
    }

    const selectedGuid = departmentSelect.value;
    if (selectedGuid) {
        const selectedNode = findNodeByGuid(fullTree, selectedGuid);
        if (selectedNode) {
            nodesToRender = collectSubDepartments(selectedNode);
        }
    }

    renderTree(nodesToRender, treeContainer);
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

// События
departmentSelect.addEventListener('change', updateTree);
showAllCheckbox.addEventListener('change', updateTree);
exportBtn.addEventListener('click', () => {
    const selectedGuid = departmentSelect.value;
    let nodesToExport = fullTree;
    if (selectedGuid) {
        const selectedNode = findNodeByGuid(fullTree, selectedGuid);
        nodesToExport = collectSubDepartments(selectedNode);
    }
    exportToPptx(nodesToExport);
});