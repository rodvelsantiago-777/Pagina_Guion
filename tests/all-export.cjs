/* Descarga única real, PDF original seguido de la plantilla técnica horizontal, sin red. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES, name) : name);
const { chromium } = load('playwright'), { PDFDocument, StandardFonts } = load('pdf-lib');
const root = path.resolve(__dirname, '..'), output = path.join(__dirname, '.output'); fs.mkdirSync(output, { recursive: true });
const ready = async page => {
  try { await page.waitForFunction(() => state.rendered && !state.busy && document.querySelector('#render-status').hidden, null, { timeout: 10000 }); }
  catch (error) { console.log(await page.evaluate(() => ({ rendered: state.rendered, busy: state.busy, scenes: state.scenes.length, feedback: document.querySelector('#feedback').textContent, status: document.querySelector('#render-status').textContent }))); throw error; }
};
async function download(page, filename) {
  const pending = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#project-menu summary').click(); await page.locator('#export-all').click();
  const file = await pending, destination = path.join(output, filename); await file.saveAs(destination);
  await page.waitForFunction(() => !state.exporting && !state.busy);
  return { bytes: fs.readFileSync(destination), name: file.suggestedFilename() };
}
async function inspect(page, bytes) {
  return page.evaluate(async bytes => {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWasm: true, useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: LocalBinaryFactory }).promise;
    try {
      const pages = [];
      for (let number = 1; number <= doc.numPages; number++) {
        const sheet = await doc.getPage(number), viewport = sheet.getViewport({ scale: 1 });
        pages.push({ text: (await sheet.getTextContent()).items.map(item => item.str).join(' ').replace(/\s+/g, ' '), width: viewport.width, height: viewport.height });
      }
      return pages;
    } finally { await doc.destroy(); }
  }, Array.from(bytes));
}
(async () => {
  const source = await PDFDocument.create(), font = await source.embedFont(StandardFonts.Courier);
  const cover = source.addPage([595, 842]); cover.drawText('EL ULTIMO PLANO', { x: 80, y: 650, size: 24, font });
  for (const heading of ['INT. ESTUDIO - DIA', 'EXT. CALLE - NOCHE']) {
    const sheet = source.addPage([595, 842]); sheet.drawText(heading, { x: 65, y: 770, size: 12, font });
    sheet.drawText('Ana prepara la siguiente toma.', { x: 65, y: 700, size: 12, font });
  }
  const buffer = Buffer.from(await source.save()), browser = await require('./editor-auth-fixture.cjs').launch(chromium, process.env.PLANO_BROWSER === 'brave'
    ? { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true } : { channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1540, height: 1100 } }), errors = [], requests = [], network = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Navegador:', error.message); }); page.on('request', request => requests.push(request.url()));
    await page.context().route('**/*', route => { if (/^https?:/.test(route.request().url())) { network.push(route.request().url()); return route.abort(); } return route.continue(); });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    assert(!requests.some(url => url.includes('all-export.js')), 'El motor de exportar todo no se descarga al iniciar');
    await page.locator('#file-input').setInputFiles({ name: 'El último plano.pdf', mimeType: 'application/pdf', buffer }); await ready(page);
    const empty = await download(page, 'guion-completo-sin-planos.pdf'), emptyPages = await inspect(page, empty.bytes);
    assert.equal(emptyPages.length, 4); assert(emptyPages[3].width > emptyPages[3].height); assert(emptyPages[3].text.includes('Todavía no hay planos'));
    const longDescription = 'PRINCIPIO-DESCRIPCION\n' + Array.from({ length: 38 }, (_, i) => `Detalle ${String(i).padStart(2, '0')}: preparar la luz y repetir la toma.\n`).join('') + 'FINAL-DESCRIPCION';
    const longSound = 'INICIO-SONIDO\n' + Array.from({ length: 28 }, (_, i) => `Sonido ${String(i).padStart(2, '0')}: ambiente de calle y diálogo.\n`).join('') + 'FINAL-SONIDO';
    await page.evaluate(({ description, sound }) => {
      const common = { shotValue: 'PM', shotAngle: 'other', shotAngleOther: 'Picada oblicua', shotLens: 'moderate-wide', shotMovement: 'tracking', grip: 'Trípode\nCabezal fluido', sound: 'Sonido directo', note: 'Comprobar continuidad.' };
      state.annotations = validateNotes([
        { ...common, id: 'L', shotId: 'long', shotName: 'P1', shotOrder: 1, type: 'line', page: 2, endPage: 3, color: '#d23c52', start: { x: .89, y: .2 }, end: { x: .89, y: .6 }, description, sound },
        { ...common, id: 'H', shotId: 'detail', shotName: 'P2', shotOrder: 0, type: 'highlight', page: 2, color: '#e8b83f', text: 'Ana prepara', rects: [{ x: .11, y: .16, width: .15, height: .02 }], description: 'PRIMER-DETALLE' },
        { ...common, id: 'H2', shotId: 'detail', shotName: 'P2', shotOrder: 0, type: 'highlight', page: 2, color: '#e8b83f', text: 'la siguiente toma', rects: [{ x: .28, y: .16, width: .2, height: .02 }], description: 'PRIMER-DETALLE' },
        { ...common, id: 'L2', shotId: 'last', shotName: 'P3', type: 'line', page: 3, color: '#64a7d9', start: { x: .8, y: .2 }, end: { x: .8, y: .6 }, note: 'Unicode: 🎬 中文.\n=HYPERLINK("literal")', description: 'ULTIMO-PLANO' }
      ]); changed();
      state.corrections = [PlanoCorrections.create([{ page: 2, text: 'Ana', rects: [{ x: .11, y: .16, width: .05, height: .02 }] }], state.pdf.numPages)]; changed();
    }, { description: longDescription, sound: longSound }); await ready(page);
    await page.locator('#stage-tabs [data-stage=technical]').click();
    const cell = page.locator('tr[data-shot-id=detail] [data-field=description]'); await cell.locator('.technical-cell-value').click();
    await cell.locator('textarea').fill('EDICION-PENDIENTE: descripción al exportar.');
    const baseline = await page.evaluate(() => ({ source: state.file.size, stage: state.stage, scene: state.scene }));
    const full = await download(page, 'guion-completo.pdf'), pages = await inspect(page, full.bytes), document = await PDFDocument.load(full.bytes);
    assert.equal(full.name, 'El último plano-completo.pdf'); assert(pages.length >= 5, 'Textos largos generan continuaciones horizontales');
    for (let i = 0; i < 3; i++) { assert.deepEqual(document.getPage(i).getMediaBox(), source.getPage(i).getMediaBox()); assert.equal(pages[i].width, 595); assert.equal(pages[i].height, 842); }
    assert(pages[0].text.includes('EL ULTIMO PLANO')); assert(pages[1].text.includes('INT. ESTUDIO')); assert(pages[2].text.includes('EXT. CALLE'));
    const technical = pages.slice(3), text = technical.map(p => p.text).join(' ').replace(/\s+/g, ' ');
    for (const sheet of technical) {
      assert(sheet.width > sheet.height); assert(Math.abs(sheet.width - 1190.55) < .1);
      for (const heading of ['ESCENA', 'PLANO', 'VALOR', 'ANGULACIÓN', 'ÓPTICA', 'MOVIMIENTO', 'GRIP', 'SONIDO', 'DESCRIPCIÓN', 'NOTAS', 'DURACIÓN']) assert(sheet.text.includes(heading), `Repite columna ${heading}`);
    }
    for (const term of ['EDICION-PENDIENTE', 'PRINCIPIO-DESCRIPCION', 'FINAL-DESCRIPCION', 'INICIO-SONIDO', 'FINAL-SONIDO', 'ULTIMO-PLANO', 'Picada oblicua', 'Angular (moderado)', 'Seguimiento', 'Cabezal fluido', 'literal', '1:24']) assert(text.includes(term), `Conserva ${term}`);
    for (let i = 0; i < 38; i++) assert(text.includes(`Detalle ${String(i).padStart(2, '0')}`));
    for (let i = 0; i < 28; i++) assert(text.includes(`Sonido ${String(i).padStart(2, '0')}`));
    assert.equal((text.match(/EDICION-PENDIENTE/g) || []).length, 1, 'Las partes del resalte forman una sola fila');
    assert(text.indexOf('EDICION-PENDIENTE') < text.indexOf('PRINCIPIO-DESCRIPCION'), 'Respeta el orden de planos');
    assert.deepEqual(await page.evaluate(() => ({ source: state.file.size, stage: state.stage, scene: state.scene })), baseline);
    assert((await page.evaluate(() => state.annotations[1].description)).startsWith('EDICION-PENDIENTE'));
    // La copia del guion conserva los píxeles originales y añade cobertura, correcciones y remates.
    const pixels = await page.evaluate(async bytes => {
      const output = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWasm: true, useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: LocalBinaryFactory }).promise;
      try {
        const render = async sheet => { const viewport = sheet.getViewport({ scale: 1 }), c = document.createElement('canvas'); c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height); await sheet.render({ canvasContext: c.getContext('2d'), viewport }).promise; return c; };
        const original = await render(await state.pdf.getPage(1)), cover = await render(await output.getPage(1));
        const a = original.getContext('2d').getImageData(0, 0, original.width, original.height).data, b = cover.getContext('2d').getImageData(0, 0, cover.width, cover.height).data;
        const marked = await render(await output.getPage(2)), line = [...marked.getContext('2d').getImageData(Math.floor(.89 * 595), Math.floor(.4 * 842), 1, 1).data];
        return { cover: a.every((v, i) => v === b[i]), line };
      } finally { await output.destroy(); }
    }, Array.from(full.bytes));
    assert(pixels.cover); assert(pixels.line[0] > 180 && pixels.line[1] < 90, 'La línea roja está en el PDF combinado');
    // Tema y vista no cambian el PDF ni restringen las escenas exportadas.
    await page.locator('#toggle-theme').click(); await page.locator('#stage-tabs [data-stage=coverage]').click(); await ready(page);
    await page.locator('#scene-select').selectOption('scene-1', { force: true }); await ready(page);
    const before = await page.evaluate(() => ({ notes: state.annotations, corrections: state.corrections, history: state.history.length, zoom: state.zoom, scroll: document.querySelector('#pdf-stage').scrollTop, view: state.scene }));
    const second = await download(page, 'guion-completo-desde-escena.pdf'); assert.deepEqual(second.bytes, full.bytes);
    assert.deepEqual(await page.evaluate(() => ({ notes: state.annotations, corrections: state.corrections, history: state.history.length, zoom: state.zoom, scroll: document.querySelector('#pdf-stage').scrollTop, view: state.scene })), before);
    assert.equal(await page.locator('.pdf-export-workbench').count(), 0);
    // Un fallo deja todas las acciones disponibles y permite reintentar.
    await page.evaluate(() => { globalThis.realAllExport = PlanoAllExport.run; PlanoAllExport.run = async () => { throw Error('Fallo de prueba'); }; });
    await page.locator('#project-menu summary').click(); await page.locator('#export-all').click(); await page.waitForFunction(() => !state.exporting);
    assert((await page.locator('#feedback').textContent()).includes('No se pudo exportar el PDF completo'));
    for (const id of ['#export-all', '#export-pdf', '#export-excel', '#remove-button']) assert(!(await page.locator(id).isDisabled()));
    await page.evaluate(() => { PlanoAllExport.run = realAllExport; });
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    console.log(`OK: descarga única offline (${pages.length} páginas), guion original primero, plantilla Excel horizontal, edición pendiente, contenido largo completo, Unicode, encabezados repetidos, cobertura, orden, duración, tema/vista, sin planos y recuperación de fallos.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
