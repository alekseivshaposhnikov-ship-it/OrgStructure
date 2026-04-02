// src/drawio.js
export function exportToDrawio(nodes) {
    // ---------- helper ----------
    function esc(text) {
         return String(text ?? '').replace(/[&<>\"]/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
        })[ch]);
    }

    // ---------- build XML ----------
    const mxfileAttrs = {
        host: "app.diagrams.net",
        modified: new Date().toISOString(),
        agent: "org-structure-viewer",
        etag: "0",
        version: "14.6.13",
        type: "device"
    };
    const mxfileOpen = `<mxfile ${Object.entries(mxfileAttrs)
        .map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
    const diagramAttrs = {
        name: "OrgStructure",
        id: "0"
    };
    const diagramOpen = `<diagram ${Object.entries(diagramAttrs)
        .map(([k, v]) => `${k}="${v}"`).join(' ')}>`;
    const graphModelOpen = '<mxGraphModel><root>';
    const rootClose = '</root></mxGraphModel>';
    const diagramClose = '</diagram>';
    const mxfileClose = '</mxfile>';

    // ---- collect XML for each node ----
    const cells = [];
    let idCounter = 1;

     // --------- build hierarchical map from flat list ---------
     // `nodes` is a flat array produced by `collectSubDepartments`.
     // We need to reconstruct the tree so that recursion works.
     const nodeMap = {};
     nodes.forEach(n => {
         // Clone node and ensure a `children` array exists for later linking.
         nodeMap[n.department_guid] = { ...n, children: [] };
     });
     // Link children to their parents.
     const roots = [];
     Object.values(nodeMap).forEach(node => {
         const parentGuid = node.parent_department_guid || node.parent_guid; // fallback if one of them exists
         if (parentGuid && nodeMap[parentGuid]) {
             nodeMap[parentGuid].children.push(node);
         } else {
             // No known parent → treat as a root of the diagram.
             roots.push(node);
         }
     });

    function addNode(node, depth = 0, parentId = null) {
        const thisId = idCounter++;
        const label = [
            node.department_name,
            `GUID: ${node.department_guid}`,
             `Код: ${node.department_code ?? ''}`,
            `Родитель: ${node.parent_department_guid || '—'}`
        ].join('\\n');

        const style = "shape=rectangle;whiteSpace=wrap;html=1;rounded=0;strokeColor=#000000;fillColor=#FFFFFF";
        const cell = `<mxCell id="${thisId}" value="${esc(label)}" style="${style}" vertex="1" parent="${parentId ?? 0}"><mxGeometry x="${depth * 200}" y="${depth * 120}" width="180" height="80" as="geometry"/></mxCell>`;
        cells.push(cell);

        if (parentId) {
            const edgeId = idCounter++;
            const edge = `<mxCell id="${edgeId}" value="" edge="1" source="${parentId}" target="${thisId}" parent="${parentId}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
            cells.push(edge);
        }

         if (Array.isArray(node.children) && node.children.length) {
            node.children.forEach(child => addNode(child, depth + 1, thisId));
        }
    }

     // Process each root (there may be several independent trees).
     roots.forEach(root => addNode(root));

    // ---------- assemble final XML ----------
    const xmlContent = [
        mxfileOpen,
        diagramOpen,
        graphModelOpen,
        ...cells,
        rootClose,
        diagramClose,
        mxfileClose
    ].join('');

    // ---------- trigger download ----------
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'org-structure.drawio';
    a.click();
    URL.revokeObjectURL(url);
}