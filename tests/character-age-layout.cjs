const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Family = require('../character-family.js'), S = require('../screenplay.js'), Archive = require('../project-archive.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
for (const [text, years] of [['0', 0], ['18 años', 18], ['1 año', 1], ['18,5', 18.5], ['6 meses', .5], ['1.200', 1200], ['1.000.000 años', 1000000]]) assert.equal(Family.ageYears(text), years);
for (const text of ['', 'Desconocida', '20-30', 'Entre 10 y 20', '-5', '1,2,3', 'Infinity', '9999999999999999999999999']) assert.equal(Family.ageYears(text), null);
for (const [age, band] of [[0, 0], [4, 0], [5, 5], [14, 10], [15, 15], [99, 95], [109, 100], [110, 110], [199, 190], [249, 200], [250, 250], [1200, 1200], [12345, 12000]]) assert.equal(Family.ageBand(age), band);
const fixture = [
  { key: 'mayor', age: '62' }, { key: 'adulto', age: '35 años' }, { key: 'peque', age: '10' },
  { key: 'par', age: '14' }, { key: 'joven', age: '15' }, { key: 'antiguo', age: '1200' },
  { key: 'incierto', age: 'Entre 20 y 30' }, { key: 'sin-edad', age: '' },
  { key: 'manual', age: '60', position: { x: 720, y: 960, grid: 1 } },
];
const layout = Family.layoutByAge(fixture);
assert.equal(layout.get('peque').y, layout.get('par').y);
assert(layout.get('antiguo').y < layout.get('mayor').y);
assert(layout.get('adulto').y < layout.get('joven').y);
assert(layout.get('joven').y < layout.get('peque').y);
assert.equal(layout.get('incierto').y, layout.get('sin-edad').y);
assert(layout.get('sin-edad').y > layout.get('peque').y);
assert.deepEqual(layout.get('manual'), { x: 720, y: 960 });
assert.equal(layout.get('adulto').y - layout.get('joven').y, -4 * Family.step, 'Las franjas vacías siguen existiendo');
assert(Math.abs(layout.get('antiguo').y) < 5000, 'Las edades fantásticas usan franjas más amplias');
const collision = Family.layoutByAge([{ key: 'fijo', age: '10', position: { x: 160, y: -160, grid: 1 } }, { key: 'auto', age: '10' }]);
assert(Math.abs(collision.get('auto').x - 160) >= 170);
assert.equal(collision.get('auto').y, -160);
const profiles = S.validateProfiles(fixture.map(item => ({ id: item.key, givenNames: item.key, surnames: '', age: item.age,
  gender: '', role: '', aliases: [], ...(item.position ? { relationshipPosition: item.position } : {}),
  ...(item.key === 'adulto' ? { details: { relationships: [{ targetId: 'peque', type: 'Familia' }] } } : {}),
})));
const packed = Archive.stringify({ name: 'Edades', documentName: 'Edades.plano', payload: {
  version: 1, screenplay: S.create('Edades'), characterProfiles: profiles, annotations: [], corrections: [], crew: {},
  proofreading: { enabled: false, dictionary: '', ignored: [] },
} });
(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: 'Edades.plano', mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Edades' && !state.busy);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    const openTree = async () => {
      await page.locator('#open-project-characters').click();
      await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
      await page.locator('.relations-node').first().waitFor();
    };
    await openTree();
    const node = id => page.locator('[data-character-key="' + id + '"]');
    const at = id => node(id).evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { x: matrix.m41 + 78, y: matrix.m42 + 40 };
    });
    assert.equal((await at('peque')).y, (await at('par')).y);
    assert.deepEqual(await at('manual'), { x: 720, y: 960 });
    assert.equal(await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'adulto').details.relationships[0].parentId), undefined, 'La colocación automática por edad conserva el parentesco existente');
    await page.screenshot({ path: path.join(__dirname, '.output/relaciones-edades.png') });
    const editAge = async (id, age) => {
      await node(id).click();
      const card = page.getByRole('dialog', { name: id, exact: true });
      await card.getByRole('button', { name: 'Editar personaje' }).click();
      await page.getByLabel('Edad', { exact: true }).fill(age);
      await page.getByRole('button', { name: 'Guardar personaje' }).click();
      await card.getByRole('button', { name: 'Cerrar ficha' }).waitFor();
      await card.getByRole('button', { name: 'Cerrar ficha' }).click();
    };
    await editAge('peque', '16');
    assert.equal((await at('peque')).y, (await at('joven')).y, 'Al cambiar la edad se actualiza su fila automática');
    const initial = await at('mayor');
    const avatar = await node('mayor').locator('.relations-avatar').boundingBox();
    const zoom = parseInt(await page.locator('[data-zoom-value]').textContent()) / 100;
    await page.mouse.move(avatar.x + avatar.width / 2, avatar.y + avatar.height / 2);
    await page.mouse.down();
    await page.mouse.move(avatar.x + avatar.width / 2 + 240 * zoom, avatar.y + avatar.height / 2 + 240 * zoom, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.relations-canvas').getAttribute('aria-busy') === 'false');
    const manual = await at('mayor');
    assert.deepEqual(manual, { x: initial.x + 240, y: initial.y + 240 });
    await editAge('mayor', '2');
    assert.deepEqual(await at('mayor'), manual, 'Cambiar la edad respeta una posición manual');
    await page.locator('#characters-back').click();
    await openTree();
    assert.deepEqual(await at('mayor'), manual, 'Reabrir conserva la distribución manual');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles.find(profile => profile.id === 'mayor').relationshipPosition), { ...manual, grid: 1 });
    assert.deepEqual(errors, []);
    console.log('OK: franjas de edad, edades enormes, datos desconocidos, posiciones manuales, edición de edad, reapertura y parentescos conservados.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
