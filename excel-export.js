/* Exportación local: la plantilla es editable y no contiene datos de otros proyectos. */
(function (root) {
  'use strict';
  const columns = [
    {field:'scene',col:1,span:2}, {field:'shotName',col:3}, {field:'shotValue',col:4},
    {field:'shotAngle',col:5}, {field:'shotLens',col:6}, {field:'shotMovement',col:7},
    {field:'grip',col:8,span:2}, {field:'sound',col:10}, {field:'description',col:11}, {field:'note',col:12,span:2}
  ];
  const palette = { ink: '242424', border: 'B5B5B5', paper: 'F5F5F5', scene: 'E2E2E2', section: '686868' };
  function rowsFrom(sections, displayName, values) {
    const rows = [];
    for (const { scene, items } of sections) {
      const seen = new Set();
      for (const item of items) {
        const id = item.shotId || item.id;
        if (seen.has(id)) continue;
        seen.add(id);
        const row = [scene.number ?? '', displayName(item), item.shotValue || ''];
        for (const key of ['shotAngle', 'shotLens', 'shotMovement']) row.push(item[key] ? values.display(item, key) : '');
        for (const key of ['grip', 'sound', 'description', 'note']) row.push(item[key] || '');
        rows.push({ sceneId: scene.id, id, data: row });
      }
    }
    return rows;
  }
  function visualLines(text, width, measure) {
    const limit = (width * 7 - 12);
    let lines = 0;
    for (const paragraph of String(text ?? '').split(/\r\n|\r|\n/)) {
      let current = '';
      for (const word of paragraph.split(/(?<=\s)/u)) {
        if (measure(current + word) <= limit) current += word;
        else {
          if (current) lines++;
          current = '';
          for (const character of word) {
            if (measure(current + character) > limit && current) { lines++; current = ''; }
            current += character;
          }
        }
      }
      lines++;
    }
    return lines;
  }
  function textParts(text, width, measure) {
    let remaining = String(text ?? ''); const parts = [];
    while (remaining && visualLines(remaining, width, measure) > 22) {
      let low = 1, high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (visualLines(remaining.slice(0, middle), width, measure) <= 22) low = middle;
        else high = middle - 1;
      }
      let cut = low;
      const boundary = Math.max(remaining.lastIndexOf('\n', cut - 1), remaining.lastIndexOf(' ', cut - 1));
      if (boundary > cut / 2) cut = boundary + 1;
      // No separar pares UTF-16 ni los dos caracteres de un salto CRLF.
      if (/[\uD800-\uDBFF]/.test(remaining[cut - 1]) || remaining[cut - 1] === '\r' && remaining[cut] === '\n') cut--;
      parts.push(remaining.slice(0, cut)); remaining = remaining.slice(cut);
    }
    parts.push(remaining); return parts;
  }
  async function run({ sections, fileName, displayName, values, exportedAt = new Date(), onProgress = () => {} }) {
    if (!root.ExcelJS || !root.PlanoExcelTemplate) throw new Error('No se pudo cargar el motor de Excel.');
    const entries = rowsFrom(sections, displayName, values);
    if (!entries.length) throw new Error('Añade al menos un plano antes de exportar el guion técnico.');
    onProgress('Preparando guion técnico en Excel…');
    const book = new root.ExcelJS.Workbook();
    await book.xlsx.load(root.PlanoExcelTemplate, { base64: true });
    book.creator = 'PLANO'; book.lastModifiedBy = 'PLANO'; book.created = exportedAt; book.modified = exportedAt;
    book.title = 'Guion técnico'; book.subject = fileName; book.description = 'Guion técnico exportado desde las líneas de cobertura.';
    const sheet = book.getWorksheet('Guion técnico');
    sheet.getCell('D3').value = fileName.replace(/\.pdf$/i, '');
    // Fecha civil del usuario, almacenada como fecha y no como texto.
    sheet.getCell('J3').style={...sheet.getCell('J3').style};
    sheet.getCell('J3').value = new Date(Date.UTC(exportedAt.getFullYear(), exportedAt.getMonth(), exportedAt.getDate()));
    sheet.getCell('J3').numFmt = 'dd/mm/yyyy';
    const unique = new Set(entries.map(entry => entry.id)).size;
    const scenes = new Set(entries.map(entry => entry.sceneId)).size;
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    context.font = '11pt Arial'; const measure = text => context.measureText(text).width;
    const lists = {};
    for (const key of values.keys) {
      const options = values.fields[key].options.filter(([code]) => code !== 'other').map(([code, label]) => key === 'shotValue' ? code : label);
      // Listas en columnas ocultas de la misma hoja: sin pestañas auxiliares.
      const column = 15 + values.keys.indexOf(key), letter = sheet.getColumn(column).letter;
      options.forEach((text, index) => { sheet.getCell(index + 1, column).value = text; });
      sheet.getColumn(column).hidden = true;
      lists[key] = `$${letter}$1:$${letter}$${options.length}`;
    }
    const widths = columns.map(({col,span=1}) => Array.from({length:span},(_,i)=>sheet.getColumn(col+i).width || sheet.properties.defaultColWidth || 9).reduce((sum,w)=>sum+w,0));
    const outputRows = [];
    for (const entry of entries) {
      const parts = entry.data.map((value, i) => i >= 6 ? textParts(value, widths[i], measure) : [value]);
      const count = Math.max(...parts.map(part => part.length));
      for (let i = 0; i < count; i++) outputRows.push({ ...entry, continuation: i > 0, data: entry.data.map((value, column) => column < 6 ? (i ? null : value) : parts[column][i] || '') });
    }
    let previousScene;
    const sceneGroups=[],shotGroups=[];
    for (const [index, entry] of outputRows.entries()) {
      const number = index + 15, row = sheet.getRow(number), newScene = entry.sceneId !== previousScene;
      if (newScene) { sceneGroups.push({first:number,last:number}); previousScene = entry.sceneId; }
      else sceneGroups.at(-1).last=number;
      if (!entry.continuation) shotGroups.push({first:number,last:number}); else shotGroups.at(-1).last=number;
      let lineCount = 1;
      for (let i = 0; i < columns.length; i++) {
        const {field,col,span=1}=columns[i];
        const cell = row.getCell(col);
        // Los estilos importados pueden estar compartidos: cada campo necesita uno propio.
        cell.style={};
        if (span>1 && i!==0) sheet.mergeCells(number,col,number,col+span-1);
        cell.value=entry.data[i] === '' ? null : entry.data[i];
        // Siempre valores de texto: '=...', '+...' y nombres como '01A' no son fórmulas ni números.
        cell.numFmt = i === 0 && typeof entry.data[i] === 'number' ? '0' : '@';
        cell.font = { name: 'Arial', size: 11, color: { argb: palette.ink }, bold: i < 2 };
        cell.alignment = { horizontal: i<6 ? 'center' : 'left', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i===0 ? palette.scene : palette.paper } };
        const thin={style:'thin',color:{argb:palette.border}};
        cell.border = { bottom:thin,left:thin,right:thin,top:newScene ? {style:'medium',color:{argb:palette.section}} : thin };
        if (lists[field]) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [lists[field]], showInputMessage: true, promptTitle: values.fields[field].label, prompt: 'Elige una opción o escribe un valor propio.', showErrorMessage: false };
        lineCount = Math.max(lineCount, visualLines(entry.data[i], widths[i], measure));
      }
      // Los textos extensos se reparten antes de alcanzar el límite de altura de Excel.
      row.height = Math.min(409, Math.max(30, lineCount * 14 + 10));
      if (index && index % 150 === 0) { onProgress(`Preparando ${index} de ${outputRows.length} filas…`); await new Promise(resolve => setTimeout(resolve, 0)); }
    }
    for(const group of shotGroups)if(group.last>group.first)for(const col of [3,4,5,6,7])sheet.mergeCells(group.first,col,group.last,col);
    for(const group of sceneGroups){
      sheet.mergeCells(group.first,1,group.last,2);
      sheet.getCell(group.first,1).numFmt=typeof sheet.getCell(group.first,1).value==='number'?'0':'@';
    }
    const last = outputRows.length + 14;
    sheet.autoFilter = undefined;
    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 14, topLeftCell: 'D15', activeCell: 'C15', showGridLines: false, zoomScale: 85 }];
    sheet.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '14:14', printArea: `A1:M${last}`, margins: { left: .25, right: .25, top: .35, bottom: .4, header: .15, footer: .2 } };
    sheet.headerFooter = { oddFooter: '&LPLANO · Guion técnico&R Página &P de &N' };
    onProgress('Generando archivo .xlsx…');
    return { bytes: await book.xlsx.writeBuffer(), shots: unique, rows: entries.length, scenes };
  }
  root.PlanoExcelExport = { run, rowsFrom };
})(globalThis);
