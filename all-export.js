/* PDF único: páginas originales con cobertura y la misma hoja del Excel en horizontal. */
(function (root) {
  'use strict';
  const pageSize = [1190.55, 841.89], margin = 28.35, footer = 25;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function columnNumber(text) { return [...text].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0); }
  function range(value) {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(value);
    return { left: columnNumber(match[1]), top: +match[2], right: columnNumber(match[3]), bottom: +match[4] };
  }
  function hex(color, fallback) { return color?.argb ? '#' + color.argb.slice(-6) : fallback; }
  function rgb(color) { return root.PDFLib.rgb(...[1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255)); }
  function textOf(cell) {
    if (cell.value instanceof Date) {
      const date = cell.value;
      return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()].map((value, i) => i < 2 ? String(value).padStart(2, '0') : value).join('/');
    }
    return String(cell.text || '').replace(/\r\n|\r/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\t/g, '    ');
  }
  function wrap(text, limit, measure) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let current = '';
      for (const word of paragraph.split(/(?<=\s)/u)) {
        if (measure(current + word) <= limit) { current += word; continue; }
        if (current) { lines.push(current.trimEnd()); current = ''; }
        for (const character of word) {
          if (current && measure(current + character) > limit) { lines.push(current.trimEnd()); current = ''; }
          current += character;
        }
      }
      lines.push(current.trimEnd());
    }
    return lines;
  }
  async function append(document, model, { fileName, onProgress }) {
    const { sheet, last } = model, { StandardFonts } = root.PDFLib;
    const fonts = {
      normal: await document.embedFont(StandardFonts.Helvetica),
      bold: await document.embedFont(StandardFonts.HelveticaBold),
      mono: await document.embedFont(StandardFonts.CourierBold)
    };
    const canvas = window.document.createElement('canvas'), context = canvas.getContext('2d');
    const x = [0], widths = [], rowHeights = [0], cells = [];
    for (let col = 1; col <= 14; col++) {
      widths[col] = Math.floor((sheet.getColumn(col).width || sheet.properties.defaultColWidth || 9) * 7 + 5) * .75;
      x[col] = x[col - 1] + widths[col];
    }
    const scale = (pageSize[0] - margin * 2) / x[14], padding = 5;
    const merges = new Map(sheet.model.merges.map(value => { const area = range(value); return [sheet.getCell(area.top, area.left).address, area]; }));
    function fontFor(cell) { return cell.font?.name === 'Courier New' ? fonts.mono : cell.font?.bold ? fonts.bold : fonts.normal; }
    function measure(text, font, size) {
      try { return font.widthOfTextAtSize(text, size); }
      catch { context.font = `${font === fonts.bold || font === fonts.mono ? 'bold ' : ''}${size}px ${font === fonts.mono ? '"Courier New"' : 'Arial'}`; return context.measureText(text).width; }
    }
    for (let row = 1; row <= last; row++) {
      rowHeights[row] = Math.max(rowHeights[row] || 0, sheet.getRow(row).height || sheet.properties.defaultRowHeight || 15);
      for (let col = 1; col <= 14; col++) {
        const cell = sheet.getCell(row, col);
        if (cell.isMerged && cell.master.address !== cell.address) continue;
        const area = merges.get(cell.address) || { top: row, bottom: row, left: col, right: col };
        const font = fontFor(cell), size = cell.font?.size || 11, lineHeight = size * 1.28;
        const text = textOf(cell), width = x[area.right] - x[area.left - 1], lines = wrap(text, Math.max(1, width - padding * 2), text => measure(text, font, size));
        const layout = { cell, area, font, size, lineHeight, width, lines, height: text ? lines.length * lineHeight + padding * 2 : 0 };
        cells.push(layout);
        // Cada fragmento de un plano largo debe dejar espacio para repetir su identificación.
        for (let part = row; part <= area.bottom; part++) rowHeights[part] = Math.max(rowHeights[part] || sheet.getRow(part).height || 15, layout.height);
      }
    }
    const pages = [], bodyTop = margin + 29, contentBottom = pageSize[1] - margin - footer;
    let current = { rows: [], top: margin, continued: false };
    function addRow(number) {
      const height = rowHeights[number] * scale;
      current.rows.push({ number, y: current.top, height }); current.top += height;
    }
    for (let row = 1; row <= 14; row++) addRow(row);
    for (let row = 15; row <= last; row++) {
      if (current.top + rowHeights[row] * scale > contentBottom) {
        pages.push(current); current = { rows: [], top: bodyTop, continued: true }; addRow(14);
      }
      if (current.top + rowHeights[row] * scale > contentBottom) throw new Error('Una fila del guion técnico es demasiado alta para la hoja horizontal. Divide su texto en párrafos más cortos.');
      addRow(row);
    }
    pages.push(current);
    const fallbackImages = new Map();
    async function drawText(page, text, font, size, color, left, baseline) {
      if (!text) return;
      try { font.encodeText(text); page.drawText(text, { x: left, y: pageSize[1] - baseline, font, size, color: rgb(color) }); }
      catch (error) {
        // Emojis y otros alfabetos conservan los glifos del navegador sin sustituirlos por '?'.
        try { font.encodeText(text); } catch {
          const key = [text, font.name, size, color].join('\u0000');
          let image = fallbackImages.get(key);
          if (!image) {
            const density = 3, width = Math.ceil(measure(text, font, size)) + 4, height = Math.ceil(size * 1.7);
            canvas.width = width * density; canvas.height = height * density; context.scale(density, density);
            context.font = `${font === fonts.bold || font === fonts.mono ? 'bold ' : ''}${size}px ${font === fonts.mono ? '"Courier New"' : 'Arial'}`;
            context.fillStyle = color; context.textBaseline = 'alphabetic'; context.fillText(text, 1, size * 1.15);
            image = { resource: await document.embedPng(canvas.toDataURL('image/png')), width, height, ascent: size * 1.15 };
            fallbackImages.set(key, image);
          }
          page.drawImage(image.resource, { x: left - 1, y: pageSize[1] - baseline - image.height + image.ascent, width: image.width, height: image.height });
          return;
        }
        throw error;
      }
    }
    async function drawCell(page, layout, visibleRows) {
      const { cell, area, font, lines } = layout;
      const first = visibleRows.find(row => row.number >= area.top && row.number <= area.bottom);
      if (!first) return;
      const active = visibleRows.filter(row => row.number >= area.top && row.number <= area.bottom);
      const left = margin + x[area.left - 1] * scale, top = first.y;
      const width = layout.width * scale, height = active.reduce((sum, row) => sum + row.height, 0);
      const fill = cell.fill?.pattern === 'solid' ? hex(cell.fill.fgColor, '#ffffff') : '#ffffff';
      page.drawRectangle({ x: left, y: pageSize[1] - top - height, width, height, color: rgb(fill) });
      const size = layout.size * scale, lineHeight = layout.lineHeight * scale, inset = padding * scale;
      const contentHeight = lines.length * lineHeight;
      const vertical = cell.alignment?.vertical;
      const textTop = top + (vertical === 'middle' ? Math.max(inset, (height - contentHeight) / 2) : vertical === 'bottom' ? Math.max(inset, height - inset - contentHeight) : inset);
      const ink = hex(cell.font?.color, '#242424');
      for (const [index, text] of lines.entries()) {
        const textWidth = measure(text, font, size), horizontal = cell.alignment?.horizontal;
        const textLeft = horizontal === 'center' ? left + (width - textWidth) / 2 : horizontal === 'right' ? left + width - inset - textWidth : left + inset;
        await drawText(page, text, font, size, ink, textLeft, textTop + index * lineHeight + size);
      }
      const border = cell.border || {};
      for (const side of ['top', 'bottom', 'left', 'right']) {
        if (!border[side]?.style) continue;
        const thickness = ({ medium: 1, thick: 1.5, hair: .2 }[border[side].style] || .4) * scale;
        const a = { x: side === 'right' ? left + width : left, y: pageSize[1] - (side === 'bottom' ? top + height : top) };
        const b = { x: side === 'left' ? left : left + width, y: pageSize[1] - (side === 'top' ? top : top + height) };
        page.drawLine({ start: a, end: b, thickness, color: rgb(hex(border[side].color, '#b5b5b5')) });
      }
    }
    try {
      for (const [index, layout] of pages.entries()) {
        onProgress(`Preparando guion técnico horizontal… ${index + 1}/${pages.length}`); await pause();
        const page = document.addPage(pageSize);
        if (layout.continued) {
          const heading = `GUION TÉCNICO · ${fileName.replace(/\.pdf$/i, '')}`;
          const lines = wrap(heading, pageSize[0] - margin * 2, text => measure(text, fonts.bold, 10));
          await drawText(page, lines[0], fonts.bold, 10, '#434343', margin, margin + 12);
        }
        const visible = new Set(layout.rows.map(row => row.number));
        let drawn = 0;
        for (const cell of cells) {
          if (![...visible].some(row => row >= cell.area.top && row <= cell.area.bottom)) continue;
          await drawCell(page, cell, layout.rows);
          if (++drawn % 150 === 0) await pause();
        }
        if (!model.rows) await drawText(page, 'Todavía no hay planos definidos en este guion.', fonts.normal, 11, '#686868', margin + 6, layout.top + 24);
        await drawText(page, 'PLANO · GUION TÉCNICO', fonts.normal, 8, '#686868', margin, pageSize[1] - margin);
        const number = `${index + 1} / ${pages.length}`;
        await drawText(page, number, fonts.normal, 8, '#686868', pageSize[0] - margin - measure(number, fonts.normal, 8), pageSize[1] - margin);
      }
    } finally { canvas.width = canvas.height = 0; fallbackImages.clear(); }
    return pages.length;
  }
  async function run({ coverage, technical, onProgress = () => {} }) {
    if (!root.PDFLib || !root.PlanoExcelExport?.workbook) throw new Error('No se pudieron cargar los motores de exportación.');
    const result = await root.PlanoPdfExport.run({ ...coverage, onProgress });
    onProgress('Preparando la hoja del guion técnico…'); await pause();
    const model = await root.PlanoExcelExport.workbook({ ...technical, allowEmpty: true, onProgress });
    const document = await root.PDFLib.PDFDocument.load(result.bytes, { updateMetadata: false });
    const scriptPages = document.getPageCount();
    const technicalPages = await append(document, model, { fileName: technical.fileName, onProgress });
    document.setTitle(`${technical.fileName.replace(/\.pdf$/i, '')} · Cobertura y guion técnico`);
    onProgress('Guardando PDF completo…'); await pause();
    return { bytes: await document.save({ updateFieldAppearances: false }), scriptPages, technicalPages, references: result.references };
  }
  root.PlanoAllExport = { run };
})(globalThis);
