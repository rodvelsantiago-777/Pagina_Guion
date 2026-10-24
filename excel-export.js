/* Exportación local: la plantilla es editable y no contiene datos de otros proyectos. */
(function (root) {
  'use strict';
  const columns = [
    {field:'scene',col:1,span:2}, {field:'shotName',col:3}, {field:'shotValue',col:4},
    {field:'shotAngle',col:5}, {field:'shotLens',col:6}, {field:'shotMovement',col:7},
    {field:'grip',col:8,span:2}, {field:'sound',col:10}, {field:'description',col:11}, {field:'note',col:12,span:2}, {field:'estimatedSeconds',col:14}
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
        row.push(root.PlanoShotScript.format(item.estimatedSeconds || 0));
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
  function crewHeader(sheet, crew, measure) {
    const roles = root.PlanoCrew.entries(crew), headerRow = 6 + Math.max(4, Math.ceil(roles.length / 2)) * 2;
    const heading = Array.from({length:14}, (_,i) => ({ value:sheet.getCell(14,i+1).value, style:structuredClone(sheet.getCell(14,i+1).style) }));
    const blank = Array.from({length:14}, (_,i) => structuredClone(sheet.getCell(6,i+1).style));
    const labelStyle = structuredClone(sheet.getCell('B7').style), nameStyle = structuredClone(sheet.getCell('E7').style);
    // Recrear solo la cabecera del equipo, sin desplazar fusiones ni validaciones de la tabla.
    for (const range of [...sheet.model.merges]) if (+range.match(/\d+/)[0] >= 5) sheet.unMergeCells(range);
    for (let row=5;row<=headerRow;row++) {
      sheet.getRow(row).height = row === headerRow-1 ? 14 : row % 2 ? 24 : 9;
      for (let col=1;col<=14;col++) { const cell=sheet.getCell(row,col); cell.value=null; cell.style=structuredClone(blank[col-1]); }
    }
    function width(first,last) { let result=0;for(let col=first;col<=last;col++)result+=sheet.getColumn(col).width||9;return result; }
    for (const [index,role] of roles.entries()) {
      const row=5+Math.floor(index/2)*2, right=index%2, first=right?9:2, labelEnd=right?9:row===5?3:4, nameFirst=right?10:labelEnd+1, nameEnd=right?12:7;
      if(first<labelEnd)sheet.mergeCells(row,first,row,labelEnd);sheet.mergeCells(row,nameFirst,row,nameEnd);
      const label=sheet.getCell(row,first),name=sheet.getCell(row,nameFirst);
      label.style=structuredClone(labelStyle);label.value=role.label+':';label.font={...label.font,size:10};label.alignment={horizontal:'left',vertical:'middle',wrapText:true};label.numFmt='@';
      name.style=structuredClone(nameStyle);name.value=role.name||null;name.numFmt='@';name.alignment={horizontal:'center',vertical:'middle',wrapText:true};
      sheet.getRow(row).height=Math.max(sheet.getRow(row).height||24,visualLines(role.label+':',width(first,labelEnd),measure)*14+10,visualLines(role.name,width(nameFirst,nameEnd),measure)*14+10);
    }
    for(let col=1;col<=14;col++){const cell=sheet.getCell(headerRow,col);cell.style=heading[col-1].style;cell.value=heading[col-1].value;}
    for(const [first,last]of [[1,2],[8,9],[12,13]])sheet.mergeCells(headerRow,first,headerRow,last);
    sheet.getRow(headerRow).height=26;
    return headerRow;
  }
  async function workbook({ sections, fileName, displayName, values, crew = {}, exportedAt = new Date(), onProgress = () => {}, allowEmpty = false }) {
    if (!root.ExcelJS || !root.PlanoExcelTemplate) throw new Error('No se pudo cargar el motor de Excel.');
    const entries = rowsFrom(sections, displayName, values);
    if (!entries.length && !allowEmpty) throw new Error('Añade al menos un plano antes de exportar el guion técnico.');
    onProgress('Preparando guion técnico en Excel…');
    const book = new root.ExcelJS.Workbook();
    await book.xlsx.load(root.PlanoExcelTemplate, { base64: true });
    book.creator = 'PLANO'; book.lastModifiedBy = 'PLANO'; book.created = exportedAt; book.modified = exportedAt;
    book.title = 'Guion técnico'; book.subject = fileName; book.description = 'Guion técnico exportado desde las líneas de cobertura.';
    const sheet = book.getWorksheet('Guion técnico');
    sheet.getColumn(14).width = 13;
    sheet.getCell('N14').style = structuredClone(sheet.getCell('G14').style); sheet.getCell('N14').value = 'DURACIÓN EST.';
    for (let number=1;number<14;number++) sheet.getCell(number,14).style = structuredClone(sheet.getCell(number,13).style);
    sheet.getCell('D3').value = fileName.replace(/\.pdf$/i, '');
    // Fecha civil del usuario, almacenada como fecha y no como texto.
    sheet.getCell('J3').style={...sheet.getCell('J3').style};
    sheet.getCell('J3').value = new Date(Date.UTC(exportedAt.getFullYear(), exportedAt.getMonth(), exportedAt.getDate()));
    sheet.getCell('J3').numFmt = 'dd/mm/yyyy';
    const unique = new Set(entries.map(entry => entry.id)).size;
    const scenes = new Set(entries.map(entry => entry.sceneId)).size;
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    context.font = '11pt Arial'; const measure = text => context.measureText(text).width;
    const headerRow = crewHeader(sheet, crew, measure);
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
      const number = index + headerRow + 1, row = sheet.getRow(number), newScene = entry.sceneId !== previousScene;
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
        cell.alignment = { horizontal: i<6 || field==='estimatedSeconds' ? 'center' : 'left', vertical: 'middle', wrapText: true };
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
    for(const group of shotGroups)if(group.last>group.first)for(const col of [3,4,5,6,7,14])sheet.mergeCells(group.first,col,group.last,col);
    for(const group of sceneGroups){
      sheet.mergeCells(group.first,1,group.last,2);
      sheet.getCell(group.first,1).numFmt=typeof sheet.getCell(group.first,1).value==='number'?'0':'@';
    }
    const last = outputRows.length + headerRow;
    sheet.autoFilter = undefined;
    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: headerRow<=14?headerRow:0, topLeftCell: headerRow<=14?`D${headerRow+1}`:'D1', activeCell: `C${headerRow+1}`, showGridLines: false, zoomScale: 85 }];
    sheet.pageSetup = { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}`, printArea: `A1:N${last}`, margins: { left: .25, right: .25, top: .35, bottom: .4, header: .15, footer: .2 } };
    sheet.headerFooter = { oddFooter: '&LPLANO · Guion técnico&R Página &P de &N' };
    return { book, sheet, last, headerRow, shots: unique, rows: entries.length, scenes };
  }
  async function run(options) {
    const { book, shots, rows, scenes } = await workbook(options);
    options.onProgress?.('Generando archivo .xlsx…');
    return { bytes: await book.xlsx.writeBuffer(), shots, rows, scenes };
  }
  root.PlanoExcelExport = { run, rowsFrom, workbook };
})(globalThis);
