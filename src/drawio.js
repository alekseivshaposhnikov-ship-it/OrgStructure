// src/drawio.js
export function exportToDrawio(nodes) {
     // ---------- helpers ----------
     const esc = text =>
         String(text ?? '')
             .replace(/[&<>"]/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;'
             })[ch]);

     // ---------- rebuild hierarchy (flat list → tree) ----------
     const nodeMap = {};
     nodes.forEach(n => {
         // keep a copy and guarantee a `children` array
         nodeMap[n.department_guid] = { ...n, children: [] };
     });
     const roots = [];
     Object.values(nodeMap).forEach(node => {
         const parentGuid = node.parent_department_guid || node.parent_guid;
         if (parentGuid && nodeMap[parentGuid]) {
             nodeMap[parentGuid].children.push(node);
         } else {
             roots.push(node);
         }
     });

     // ---------- label builder ----------
     const buildLabel = node => {
         const lines = [];

         // 1️⃣ Department name + staff count
         const name = node.department_name ?? '';
         const count = node.staffCount ?? 0;
         lines.push(`${name} (${count})`);

         // 2️⃣ Manager (if any)
         if (node.department_manager) {
             lines.push(`Руководитель: ${node.department_manager}`);
         }

         // 3️⃣ Employees list (full name → email fallback)
         if (Array.isArray(node.users) && node.users.length) {
             const empLines = node.users
                 .map(u => u.full_name || u.email || '')
                 .filter(Boolean)
                 .join('\n');
             if (empLines) {
                 lines.push('Сотрудники:');
                 lines.push(empLines);
             }
         }

         return lines.join('\n');
     };

     // ---------- XML assembly ----------
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
     const diagramOpen = `<diagram name="OrgStructure" id="0">`;
     const graphModelOpen = '<mxGraphModel><root>';
     const graphModelClose = '</root></mxGraphModel>';
     const diagramClose = '</diagram>';
     const mxfileClose = '</mxfile>';

     const cells = [];
     let idCounter = 2; // 0 and 1 are reserved by mxGraphModel

     const addNode = (node, depth = 0, parentId = null) => {
         const thisId = `${idCounter++}`;
         const label = esc(buildLabel(node));
        const style = "shape=rectangle;whiteSpace=wrap;html=1;rounded=0;strokeColor=#000000;fillColor=#FFFFFF";
         const x = depth * 200; // simple horizontal offset
         const y = 0;            // vertical layout will be handled by edges
         cells.push(
             `<mxCell id="${thisId}" value="${label}" style="${style}" vertex="1" parent="${parentId ?? 0}">` +
             `<mxGeometry x="${x}" y="${y}" width="180" height="80" as="geometry"/>` +
             `</mxCell>`
         );

         // Edge from parent to this node
        if (parentId) {
             const edgeId = `${idCounter++}`;
             cells.push(
                 `<mxCell id="${edgeId}" value="" edge="1" source="${parentId}" target="${thisId}" parent="${parentId}">` +
                 `<mxGeometry relative="1" as="geometry"/>` +
                 `</mxCell>`
             );
        }

         // Recurse for children
         if (node.children && node.children.length) {
             node.children.forEach(child => addNode(child, depth + 1, thisId));
    }
     };

     // Process every root (there may be several independent trees)
     roots.forEach(root => addNode(root));

     // ---------- final XML ----------
     const xml = [
        mxfileOpen,
        diagramOpen,
        graphModelOpen,
        ...cells,
         graphModelClose,
        diagramClose,
        mxfileClose
    ].join('');

    // ---------- trigger download ----------
     const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'org-structure.drawio';
    a.click();
    URL.revokeObjectURL(url);
}