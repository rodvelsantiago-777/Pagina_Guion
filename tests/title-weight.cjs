/* Verifica el grosor visible de las letras, además del font-weight declarado. */
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), { pathToFileURL } = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES, name) : name);
const { chromium } = load('playwright'), { PDFDocument, StandardFonts } = load('pdf-lib'), { PNG } = load('pngjs');
const out = path.join(__dirname, '.output'); fs.mkdirSync(out, { recursive: true });
function inkPixels(buffer, white) {
  const png = PNG.sync.read(buffer); let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const channels = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (channels.every(value => white ? value > 225 : value < 35)) count++;
  }
  return count;
}
(async () => {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Courier);
  pdf.addPage([595, 842]).drawText('INT. ESTUDIO - DIA', { x: 60, y: 780, size: 12, font });
  const browser = await require('./editor-auth-fixture.cjs').launch(chromium, process.env.PLANO_BROWSER === 'brave'
    ? { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true }
    : { channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.locator('#file-input').setInputFiles({ name: 'Negrita.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
    const ready = () => page.waitForFunction(() => state.rendered && !state.busy && document.querySelector('#render-status').hidden);
    await ready(); await page.locator('#scene-select').selectOption('print', { force: true }); await ready();
    await page.evaluate(() => {
      state.annotations = validateNotes([
        { id: 'L', shotName: 'P27C', type: 'line', page: 1, color: '#999999', start: { x: .3, y: .2 }, end: { x: .3, y: .8 } },
        { id: 'H', shotName: 'P28D', type: 'highlight', page: 1, color: '#27476b', text: 'Texto', rects: [{ x: .6, y: .3, width: .1, height: .02 }], labelPosition: { x: .7, y: .3 }, labelUnrestricted: true }
      ]); changed();
    }); await ready();
    for (const id of ['L', 'H']) {
      const label = page.locator(`.document-shot-label[data-annotation-id="${id}"]`).first();
      assert.equal(await label.evaluate(el => getComputedStyle(el).fontWeight), '700');
      assert((await label.evaluate(el => getComputedStyle(el).fontFamily)).includes('Courier New'));
      const beforeRule = await page.addStyleTag({ content: '.document-shot-tag>.document-shot-label{-webkit-text-stroke:0!important}' });
      const before = await label.screenshot(); await beforeRule.evaluate(el => el.remove());
      const after = await label.screenshot({ path: path.join(out, `nombre-negrita-${id}.png`) });
      const ratio = inkPixels(after, id === 'H') / inkPixels(before, id === 'H');
      assert(ratio > 1.15, `${id}: debe aumentar visiblemente la tinta de las letras (${ratio})`);
      console.log(`Grosor visible ${id}: +${Math.round((ratio - 1) * 100)}% de píxeles de tinta.`);
      await label.hover(); assert.equal(await label.evaluate(el => getComputedStyle(el).webkitTextStrokeWidth), '0.5px');
    }
    // Exporta y rasteriza ambos resultados para comprobar las letras que realmente recibe el PDF.
    await page.evaluate(() => loadScript('vendor/pdf-lib.min.js'));
    async function exportedInk(thin) {
      return page.evaluate(async thin => {
        const rule = document.createElement('style');
        if (thin) { rule.textContent = '.document-shot-tag>.document-shot-label{-webkit-text-stroke:0!important}'; document.head.append(rule); }
        try {
          const result = await PlanoPdfExport.run({ source: state.file, pdf: state.pdf, annotations: state.annotations, scenes: state.scenes, displayName: item => item.shotName });
          const output = await pdfjsLib.getDocument({ data: result.bytes.slice(), isEvalSupported: false, useWasm: true, useSystemFonts: false, useWorkerFetch: false, BinaryDataFactory: LocalBinaryFactory }).promise;
          try {
            const sheet = await output.getPage(1), viewport = sheet.getViewport({ scale: 2 }), canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            await sheet.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            // Cuenta únicamente el interior azul del rótulo, no el papel blanco alrededor.
            const blue = [];
            for (let y = Math.floor(.3 * canvas.height); y < .36 * canvas.height; y++) for (let x = Math.floor(.7 * canvas.width); x < .9 * canvas.width; x++) {
              const i = (y * canvas.width + x) * 4;
              if (pixels[i] < 60 && pixels[i + 1] >= 50 && pixels[i + 1] < 110 && pixels[i + 2] >= 90 && pixels[i + 2] < 150) blue.push([x, y]);
            }
            if (!blue.length) throw Error('No aparece el nombre en el PDF');
            const left = Math.min(...blue.map(p => p[0])) + 2, right = Math.max(...blue.map(p => p[0])) - 2;
            const top = Math.min(...blue.map(p => p[1])) + 2, bottom = Math.max(...blue.map(p => p[1])) - 2;
            let count = 0;
            for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
              const i = (y * canvas.width + x) * 4; if (pixels[i] > 225 && pixels[i + 1] > 225 && pixels[i + 2] > 225) count++;
            }
            const image = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
            return { count, image, bytes: Array.from(result.bytes) };
          } finally { await output.destroy(); }
        } finally { rule.remove(); }
      }, thin);
    }
    const oldPdf = await exportedInk(true), newPdf = await exportedInk(false);
    assert(newPdf.count > oldPdf.count * 1.15, 'El PDF contiene el trazo reforzado real');
    fs.writeFileSync(path.join(out, 'nombres-negrita.pdf'), Buffer.from(newPdf.bytes));
    fs.writeFileSync(path.join(out, 'nombres-negrita-pdf.png'), Buffer.from(newPdf.image.split(',')[1], 'base64'));
    assert.deepEqual(errors, []);
    console.log(`OK: Courier New, negrita visible en líneas/resaltados, texto negro/blanco, hover y PDF (+${Math.round((newPdf.count / oldPdf.count - 1) * 100)}% de tinta).`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
