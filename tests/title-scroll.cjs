/* Arrastrar un título con el puntero quieto y desplazar el visor con la rueda. */
const assert = require('node:assert/strict'), path = require('node:path'), { pathToFileURL } = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES, name) : name);
const { chromium } = load('playwright'), { PDFDocument, StandardFonts } = load('pdf-lib');
const ready = page => page.waitForFunction(() => state.rendered && !state.busy && document.querySelector('#render-status').hidden);
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
(async () => {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Courier);
  for (let i = 0; i < 3; i++) {
    const sheet = pdf.addPage([595, 842]);
    if (!i) sheet.drawText('INT. ESTUDIO - DIA', { x: 70, y: 790, size: 12, font });
    sheet.drawText('Una escena larga para probar el desplazamiento.', { x: 70, y: 750, size: 12, font });
    sheet.drawText('La escena continua hasta el final de esta pagina.', { x: 70, y: 70, size: 12, font });
  }
  const browser = await require('./editor-auth-fixture.cjs').launch(chromium, process.env.PLANO_BROWSER === 'brave'
    ? { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true }
    : { channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.locator('#file-input').setInputFiles({ name: 'Arrastre.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    await ready(page);
    const scene = await page.evaluate(() => state.scenes[0].id);
    for (const mode of ['print', 'all', 'editing', scene]) {
      await page.locator('#scene-select').selectOption(mode, { force: true }); await ready(page);
      for (const type of ['highlight', 'line']) for (const unrestricted of [true, false]) {
        await page.evaluate(({ type, unrestricted }) => {
          state.fit = false; state.zoom = 1;
          state.annotations = validateNotes([{ id: 'scroll-title', shotId: 'scroll-title', shotName: 'P1', page: 1, type, color: '#e8b83f', labelUnrestricted: unrestricted,
            ...(type === 'line' ? { start: { x: .5, y: .15 }, end: { x: .5, y: .9 }, lineLabel: { t: .3, side: 'right' } }
              : { text: 'Texto', rects: [{ x: .2, y: .35, width: .1, height: .02 }], labelPosition: { x: .2, y: .37 } }) }]);
          refreshSegments(); renderDocument(); refreshAnnotations();
        }, { type, unrestricted });
        await ready(page);
        const label = page.locator('.document-shot-label[data-annotation-id="scroll-title"]').first();
        await label.scrollIntoViewIfNeeded(); await settle(page);
        const box = await label.boundingBox(), pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await page.mouse.move(pointer.x, pointer.y); await page.mouse.down();
        // Inicia el arrastre solo con la rueda, sin un pointermove adicional.
        const beforeScroll = await page.locator('#pdf-stage').evaluate(el => el.scrollTop);
        await page.mouse.wheel(0, 130);
        await page.waitForFunction(before => document.querySelector('#pdf-stage').scrollTop > before + 80, beforeScroll);
        await settle(page);
        const ghost = page.locator('.dragging-title'); await ghost.waitFor();
        let preview = await ghost.boundingBox();
        assert(Math.abs(preview.y - box.y) < 4, `${mode}/${type}/${unrestricted}: el título sigue bajo el puntero al bajar`);
        assert(Math.abs(preview.x - box.x) < 4, 'La rueda vertical no desplaza el título a los lados');
        await page.mouse.wheel(0, -55);
        await page.waitForFunction(before => document.querySelector('#pdf-stage').scrollTop < before + 100, beforeScroll);
        await settle(page); preview = await ghost.boundingBox();
        assert(Math.abs(preview.y - box.y) < 4, 'También sigue el cursor al subir');
        const intendedTop = await ghost.evaluate(el => el.getBoundingClientRect().top - el.parentElement.getBoundingClientRect().top);
        await page.mouse.up(); await ready(page);
        assert.equal(await ghost.count(), 0);
        const savedTop = await label.evaluate(el => el.parentElement.getBoundingClientRect().top - el.parentElement.parentElement.getBoundingClientRect().top);
        assert(Math.abs(savedTop - intendedTop) < 4, 'Soltar guarda la posición previsualizada dentro del documento');
        assert(await page.evaluate(() => [...state.viewer.contexts.values()].every(c => !c.draggingTitle)), 'Libera el estado de arrastre');
        if (type === 'line') assert(await page.evaluate(() => {
          const note = state.annotations[0]; return !note.labelPosition && note.lineLabel.t > .3 && note.start.y === .15 && note.end.y === .9;
        }), 'La etiqueta sigue ligada a la línea, sin alterar la cobertura');
      }
    }
    // Cancelar no guarda el movimiento ni deja oyentes o una previsualización activa.
    const before = await page.evaluate(() => structuredClone(state.annotations));
    const label = page.locator('.document-shot-label[data-annotation-id="scroll-title"]').first();
    await label.scrollIntoViewIfNeeded(); const box = await label.boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await page.mouse.wheel(0, 80);
    await page.locator('.dragging-title').waitFor(); await page.keyboard.press('Escape'); await page.mouse.up();
    await page.mouse.wheel(0, -60); await settle(page);
    assert.deepEqual(await page.evaluate(() => state.annotations), before);
    assert.equal(await page.locator('.dragging-title').count(), 0);
    assert.deepEqual(errors, []);
    console.log('OK: rueda sin mover el ratón, ambas direcciones, resaltados y líneas, colocación libre/protegida, cuatro vistas, guardado y cancelación.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
