const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js'), Details = require('../character-details.js'), Archive = require('../project-archive.js');
const Router = require('../character-feeling-router.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
assert.equal(Details.feelingGroups.length, 5);
assert.equal(new Set(Details.feelingGroups.flatMap(group => group.types)).size, Details.feelingTypes.length);
assert.equal(new Set(Details.feelingGroups.map(group => group.color)).size, 5);
const base = { surnames: '', aliases: [], role: '' };
const profiles = S.validateProfiles([
  { ...base, id: 'monica', givenNames: 'Mónica Raquel', surnames: 'Flores Ortiga', gender: 'Mujer', age: '52',
    relationshipPosition: { x: 0, y: 0 }, details: { startStatus: 'Vivo',
      relationships: [{ targetId: 'daniel', type: 'Romance', married: true, broken: true }, { targetId: 'angela', type: 'Familia', parentId: 'monica' }],
      feelings: [{ targetId: 'angela', feeling: 'Amor' }] } },
  { ...base, id: 'daniel', givenNames: 'Daniel Arturo', surnames: 'Márquez Reyes', gender: 'Hombre', age: '60',
    relationshipPosition: { x: 360, y: 0 }, details: { startStatus: 'Vivo', relationships: [{ targetId: 'angela', type: 'Familia', parentId: 'daniel' }],
      feelings: [{ targetId: 'monica', feeling: 'Desprecio' }, { targetId: 'angela', feeling: 'Rencor' }] } },
  { ...base, id: 'angela', givenNames: 'Ángela', gender: 'Mujer', age: '17', relationshipPosition: { x: 180, y: 300 },
    details: { startStatus: 'Vivo', feelings: [{ targetId: 'monica', feeling: 'Indiferencia' }, { targetId: 'daniel', feeling: 'Tristeza' }, { targetId: 'juan', feeling: 'Enamoramiento' }] } },
  { ...base, id: 'juan', givenNames: 'Juan José', gender: 'Hombre', age: '17', relationshipPosition: { x: -360, y: 300 },
    details: { startStatus: 'Vivo', relationships: [{ targetId: 'angela', type: 'Conocidos' }], feelings: [{ targetId: 'angela', feeling: 'Cariño' }] } },
]);
const source = { name: 'Claridad de conexiones', documentName: 'Conexiones.plano', payload: { version: 1, screenplay: S.create('Claridad de conexiones'), characterProfiles: profiles,
  annotations: [], corrections: [], crew: {}, proofreading: { enabled: false, dictionary: '', ignored: [] } } };
const edgeData = profiles.flatMap(profile => (profile.details.feelings || []).map(entry => ({ id: profile.id + ':' + entry.targetId,
  source: profile.id, target: entry.targetId, size: { width: 100, height: 26 } })));
const positions = new Map(profiles.map(profile => [profile.id, profile.relationshipPosition]));
const routed = Router.routeAll(edgeData, positions);
assert.equal(routed.size, 7);
for (const edge of edgeData) {
  const route = routed.get(edge.id), target = positions.get(edge.target);
  assert(Math.hypot(route.end.x - target.x, route.end.y - target.y) > 50, 'La punta queda fuera del avatar');
  assert(!/NaN|Infinity/.test(route.path));
}
const direct = Router.routeAll([{ id: 'simple', source: 'a', target: 'b', size: { width: 80, height: 25 } }],
  new Map([['a', { x: 0, y: 0 }], ['b', { x: 480, y: 0 }]]));
assert.equal(direct.get('simple').points.length, 2, 'Sin obstáculos usa una recta');
const adjacent = Router.routeAll([{ id: 'simple', source: 'a', target: 'b', size: { width: 80, height: 25 } }],
  new Map([['a', { x: 0, y: 0 }], ['b', { x: 480, y: 0 }]]), {
    labels: [{ left: 180, right: 300, top: -20, bottom: 20 }], segments: [{ a: { x: 0, y: 0 }, b: { x: 480, y: 0 } }],
  });
assert.equal(adjacent.get('simple').points.length, 2, 'El rótulo de la relación no obliga a rodear la pareja');
(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(Archive.stringify(source)) });
    await page.waitForFunction(() => state.screenplay?.title === 'Claridad de conexiones' && !state.busy);
    await page.locator('#editor-home').click(); await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click(); await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    const paths = page.locator('.relations-feeling-path'), heads = page.locator('.relations-feeling-arrow');
    assert.equal(await paths.count(), 7); assert.equal(await heads.count(), 7);
    assert.equal(new Set(await paths.evaluateAll(nodes => nodes.map(node => node.getAttribute('stroke')))).size, 5);
    const collisions = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.relations-node')].map(node => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return { id: node.dataset.characterKey, x: matrix.m41 + 78, y: matrix.m42 + 40 };
      });
      const results = [];
      for (const path of document.querySelectorAll('.relations-feeling-path')) {
        const length = path.getTotalLength();
        for (let index = 0; index <= 120; index++) {
          const point = path.getPointAtLength(length * index / 120);
          for (const node of nodes) if (Math.hypot(point.x - node.x, point.y - node.y) < 42) results.push(path.dataset.feelingSource + '→' + path.dataset.feelingTarget + ' / ' + node.id);
        }
      }
      return [...new Set(results)];
    });
    assert.deepEqual(collisions, [], 'Los sentimientos rodean los avatares');
    const labelOverlaps = await page.evaluate(() => {
      const feelings = [...document.querySelectorAll('.relations-feeling-link')];
      const formal = [...document.querySelectorAll('.relations-link:not([hidden])')];
      const overlapping = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const results = [];
      for (let index = 0; index < feelings.length; index++) for (const other of [...feelings.slice(index + 1), ...formal]) {
        if (overlapping(feelings[index].getBoundingClientRect(), other.getBoundingClientRect())) results.push(feelings[index].textContent + ' / ' + other.textContent);
      }
      return results;
    });
    assert.deepEqual(labelOverlaps, [], 'Las etiquetas no se superponen en la familia de referencia');
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-familia-legible.png') });
    const connection = page.getByRole('button', { name: /^Editar sentimiento de Daniel.*hacia Mónica.*Desprecio/ });
    await connection.hover();
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')), false);
    await page.waitForTimeout(3100);
    assert(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')));
    assert.equal(await page.locator('.relations-node.is-feeling-endpoint').count(), 2);
    assert.equal(await page.locator('.relations-feeling-path.is-traced').count(), 1);
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-seguir-flecha.png') });
    await page.locator('.relations-canvas').hover({ position: { x: 5, y: 5 } });
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')), false, 'Salir elimina el resaltado inmediatamente');
    await connection.hover();
    await connection.focus();
    await page.waitForTimeout(1000);
    await page.locator('.relations-canvas').hover({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2150);
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')), false, 'El foco no retiene el resaltado y salir cancela la espera');
    await connection.hover();
    await page.waitForTimeout(2500);
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')), false, 'La espera comienza de nuevo al regresar');
    await page.waitForTimeout(650);
    assert(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')));
    await page.locator('.relations-canvas').hover({ position: { x: 5, y: 5 } });
    const near = await page.locator('.relations-feeling-path[data-feeling-source="daniel"][data-feeling-target="monica"]').evaluate(path => {
      const point = path.getPointAtLength(path.getTotalLength() * .25).matrixTransform(path.getScreenCTM());
      return { x: point.x, y: point.y + 8 };
    });
    await page.mouse.move(near.x, near.y);
    await page.waitForTimeout(3100);
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-feeling')), false, 'Pasar cerca de una flecha no cuenta como pasar sobre ella');
    const family = await page.locator('.relations-family-branch').evaluate(path => {
      const point = path.getPointAtLength(path.getTotalLength() * .35).matrixTransform(path.getScreenCTM());
      return { x: point.x, y: point.y };
    });
    await page.mouse.move(family.x, family.y);
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-relation')), false);
    await page.waitForTimeout(3100);
    assert(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-relation')));
    assert.equal(await page.locator('.relations-node.is-relation-endpoint').count(), 3, 'La rama destaca a la hija y ambos progenitores');
    assert.equal(await page.locator('.relations-lines > path.is-traced').count(), 2);
    await page.screenshot({ path: path.join(__dirname, '.output/parentesco-resaltado.png') });
    await page.locator('.relations-canvas').hover({ position: { x: 5, y: 5 } });
    assert.equal(await page.locator('.relations-canvas').evaluate(element => element.classList.contains('is-tracing-relation')), false);
    await connection.click();
    const dialog = page.locator('.relations-feeling-dialog');
    assert.deepEqual(await dialog.locator('optgroup').evaluateAll(groups => groups.map(group => group.label)), Details.feelingGroups.map(group => group.label));
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('.relations-canvas').hover({ position: { x: 5, y: 5 } });
    const before = await paths.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    await page.getByRole('button', { name: 'Acercar árbol' }).click();
    assert.deepEqual(await paths.evaluateAll(nodes => nodes.map(node => node.getAttribute('d'))), before, 'Acercar reutiliza el trazado');
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await page.evaluate(() => {
      globalThis.feelingRouteCalls = 0;
      const route = PlanoFeelingRouter.routeAll;
      PlanoFeelingRouter.routeAll = (...args) => { feelingRouteCalls++; return route(...args); };
    });
    const avatar = await page.locator('[data-character-key="monica"] .relations-avatar').boundingBox();
    await page.mouse.move(avatar.x + avatar.width / 2, avatar.y + avatar.height / 2);
    await page.mouse.down();
    await page.mouse.move(avatar.x + avatar.width / 2 - 48, avatar.y + avatar.height / 2, { steps: 6 });
    assert.equal(await page.evaluate(() => feelingRouteCalls), 0, 'Durante el arrastre se actualizan los extremos sin recalcular todos los carriles');
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.relations-canvas').getAttribute('aria-busy') === 'false');
    assert.equal(await page.evaluate(() => feelingRouteCalls), 1, 'El trazado se resuelve una vez al soltar');
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'dark' }));
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-familia-oscuro.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    assert(await page.locator('#characters-relations-panel').evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-colores-movil.png') });
    assert.deepEqual(errors, []);
    console.log('OK: familia densa, 5 grupos, puntas visibles, avatares y rótulos despejados, seguimiento, trazado estable al acercar y móvil.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
