/* Sin correos reales: el único destino externo permitido está interceptado. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(path.join(process.env.PLANO_RUNTIME_MODULES, 'playwright'));
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, '.output');
const base = 'https://rodvelsantiago-777.github.io/Pagina_Guion/';
const endpoint = 'https://formsubmit.co/ajax/rodvelsantiago@gmail.com';
const brave = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.PLANO_BROWSER === 'brave' ? { executablePath: brave, headless: true } : { channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    let response = 'activation', requests = [], errors = [];
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === endpoint) {
        requests.push({ body: route.request().postDataJSON(), headers: route.request().headers() });
        if (response === 'network') return route.abort();
        if (response === 'slow') { await new Promise(resolve => setTimeout(resolve, 200)); }
        if (response === 'bad-json') return route.fulfill({ status: 502, body: 'Bad gateway' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response === 'activation' ?
          { success: 'false', message: "This form needs Activation. We've sent you an email containing an 'Activate Form' link." } :
          response === 'rejected' ? { success: false } : { success: 'true' }) });
      }
      if (!url.startsWith(base)) return route.abort();
      const relative = decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length)) || 'index.html';
      if (relative === 'cloud-config.js') return route.fulfill({ contentType: 'text/javascript', body: 'globalThis.PlanoCloudConfig={};' });
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '?private-project=DO-NOT-SEND&session=DO-NOT-SEND');
    await page.locator('#report-launch').click();
    assert(await page.locator('#report-dialog').evaluate(el => el.open));
    assert(await page.locator('.app-shell').evaluate(el => el.inert), 'Se puede reportar sin acceder a la cuenta');
    await page.locator('.report-send').click(); assert.equal(requests.length, 0);
    await page.locator('#report-title').fill('Error al mover un plano');
    await page.locator('#report-details').fill('Arrastro el título y no sigue al cursor al cambiar de página.');
    await page.locator('#report-email').pressSequentially('san', { delay: 40 });
    assert.equal(await page.locator('#report-email').getAttribute('type'), 'text');
    await page.locator('.report-send').click(); assert.equal(requests.length, 0, 'Correo inválido no sale');
    await page.locator('#report-email').fill('usuario@example.invalid');
    await page.locator('.report-send').click();
    await page.waitForFunction(() => document.querySelector('#report-status').textContent.includes('pendiente de activación'));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.Apartado, 'Acceso a la cuenta');
    assert.equal(requests[0].body._replyto, 'usuario@example.invalid');
    assert.equal(requests[0].headers.referer, 'https://rodvelsantiago-777.github.io/');
    assert(!JSON.stringify(requests).includes('DO-NOT-SEND'), 'No envía la URL privada ni el token de ventana');
    assert(!('authorization' in requests[0].headers));
    assert(!('_captcha' in requests[0].body), 'No se desactiva la protección del proveedor');
    response = 'network'; await page.locator('.report-send').click();
    await page.waitForFunction(() => document.querySelector('#report-status').textContent.includes('No pudimos confirmar'));
    const draft = await page.locator('#report-details').inputValue();
    await page.locator('.report-dismiss').click(); await page.locator('#report-launch').click();
    assert.equal(await page.locator('#report-details').inputValue(), draft, 'Cerrar conserva el borrador que falló');
    for (const mode of ['rejected', 'bad-json']) {
      response = mode; await page.locator('.report-send').click();
      await page.waitForFunction(() => document.querySelector('.report-send').textContent.includes('Reintentar'));
      assert.equal(await page.locator('#report-details').inputValue(), draft);
    }
    // Timeout sin esperar veinte segundos ni enviar otra petición real.
    response = 'slow';
    await page.evaluate(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 20000 ? 20 : ms, ...args);
    });
    await page.locator('.report-send').click();
    await page.waitForFunction(() => document.querySelector('#report-status').textContent.includes('tardó demasiado'));
    response = 'slow'; const before = requests.length;
    await page.evaluate(() => { document.querySelector('#report-form').requestSubmit(); document.querySelector('#report-form').requestSubmit(); });
    await page.waitForFunction(() => !document.querySelector('#report-dialog').hasAttribute('aria-busy'));
    assert.equal(requests.length, before + 1, 'Evita doble envío');
    response = 'success'; await page.locator('.report-send').click();
    await page.waitForFunction(() => document.querySelector('#report-status').textContent.includes('Reporte recibido'));
    assert(await page.locator('.report-send').isDisabled());
    await page.locator('.report-dismiss').click(); await page.locator('#report-launch').click();
    assert.equal(await page.locator('#report-details').inputValue(), '');
    assert.equal(await page.locator('#report-details').getAttribute('readonly'), null, 'Se puede escribir el siguiente reporte');
    await page.locator('#report-title').fill('Segundo reporte'); await page.locator('#report-details').fill('Otro error para revisar con calma.');
    await page.locator('.report-send').click(); assert((await page.locator('#report-status').textContent()).includes('un minuto'));
    await page.locator('.report-dismiss').click();
    // Acceso sobre un formulario modal existente, sin perder sus campos.
    await page.evaluate(() => {
      document.body.classList.remove('auth-locked'); document.querySelector('.app-shell').inert = false;
      const d = document.createElement('dialog'); d.id = 'report-test-under';
      d.innerHTML = '<label>Título<input value="Trabajo sin guardar"></label>'; document.body.append(d); d.showModal();
    });
    await page.waitForFunction(() => document.querySelector('#report-launch').parentElement.id === 'report-test-under');
    await page.locator('#report-launch').click(); await page.locator('.report-dismiss').click();
    assert(await page.locator('#report-test-under').evaluate(el => el.open));
    assert.equal(await page.locator('#report-test-under input').inputValue(), 'Trabajo sin guardar');
    await page.evaluate(() => {
      const copy = document.querySelector('#report-test-under').cloneNode(true); copy.id = 'report-test-clone'; copy.removeAttribute('open'); document.body.append(copy);
    });
    await page.waitForFunction(() => document.querySelectorAll('#report-launch').length === 1);
    await page.evaluate(() => document.querySelector('#report-test-under').remove());
    await page.waitForFunction(() => document.querySelector('#report-launch').parentElement === document.body);
    // Los apartados se resuelven sin leer el proyecto ni las notas del usuario.
    for (const [classes, label] of [['', 'Proyectos'], ['is-editing is-writing', 'Escribir guion'], ['is-editing', 'Líneas de cobertura'], ['is-editing is-technical', 'Guion técnico']]) {
      await page.evaluate(classes => { document.body.className = classes; }, classes);
      await page.locator('#report-launch').click();
      assert((await page.locator('#report-context').textContent()).includes(label));
      await page.locator('.report-dismiss').click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#report-launch').click();
    assert(await page.locator('.report-send').isVisible());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await page.locator('#report-dialog').boundingBox(); assert(box.x >= 0 && box.x + box.width <= 390);
    await page.screenshot({ path: path.join(out, 'reportes-movil.png') });
    await page.locator('.report-dismiss').click();
    await page.evaluate(() => document.querySelector('#toggle-theme').click());
    await page.locator('#report-launch').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    const colors = await page.locator('#report-dialog').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() }));
    assert.notEqual(colors.background, 'rgb(255, 255, 255)');
    await page.screenshot({ path: path.join(out, 'reportes-oscuro.png') });
    await page.locator('.report-dismiss').click();
    await context.setOffline(true);
    const offlineCount = requests.length;
    // Otra página no tiene intervalo de espera ni borrador de la primera.
    const offline = await context.newPage();
    await context.setOffline(false); await offline.goto(base + 'technical-window.html'); await context.setOffline(true);
    await offline.locator('#report-launch').click(); await offline.locator('#report-title').fill('Error sin conexión');
    await offline.locator('#report-details').fill('Detalle de la incidencia sin conexión.'); await offline.locator('.report-send').click();
    assert((await offline.locator('#report-status').textContent()).includes('No hay conexión'));
    assert.equal(requests.length, offlineCount); await context.setOffline(false); await offline.close();
    await page.emulateMedia({ media: 'print' }); assert(!await page.locator('#report-launch').isVisible());
    // La ventana independiente tiene su propio formulario, incluso sin conexión al editor.
    const detached = await context.newPage(); await detached.goto(base + 'technical-window.html?session=DO-NOT-SEND');
    await detached.locator('#report-launch').click(); assert((await detached.locator('#report-context').textContent()).includes('ventana independiente'));
    assert.equal(await detached.locator('#report-details').inputValue(), '');
    assert.deepEqual(errors, []);
    console.log('OK reportes: acceso global/modal/independiente, privacidad, activación, errores, borradores, doble envío, móvil e impresión.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
