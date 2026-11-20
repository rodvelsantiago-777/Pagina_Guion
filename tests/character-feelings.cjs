const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js'), Details = require('../character-details.js'), Archive = require('../project-archive.js');
const Router = require('../character-feeling-router.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const base = { surnames: '', age: '35', aliases: [], role: '' };
const profiles = S.validateProfiles([
  { ...base, id: 'ana', givenNames: 'Ana', gender: 'Mujer', relationshipPosition: { x: 0, y: 0 },
    details: { relationships: [{ targetId: 'beto', type: 'Romance', married: true, broken: false }] } },
  { ...base, id: 'beto', givenNames: 'Beto', gender: 'Hombre', relationshipPosition: { x: 480, y: 0 } },
]);
const withFeelings = S.validateProfiles(profiles.map(profile => ({ ...profile, details: { ...profile.details,
  feelings: [{ targetId: profile.id === 'ana' ? 'beto' : 'ana', feeling: profile.id === 'ana' ? 'Amor' : 'Odio' }],
} })));
assert.deepEqual(Details.feelingsFor(withFeelings, 'ana'), [
  { targetId: 'beto', feeling: 'Amor', direction: 'outgoing' }, { targetId: 'beto', feeling: 'Odio', direction: 'incoming' },
]);
assert(Details.feelingTypes.length >= 20);
for (const entries of [[{ targetId: 'ana', feeling: 'Amor' }], [{ targetId: 'nadie', feeling: 'Odio' }],
  [{ targetId: 'beto', feeling: 'Inventado' }], [{ targetId: 'beto', feeling: 'Amor' }, { targetId: 'beto', feeling: 'Odio' }]])
  assert.throws(() => S.validateProfiles([{ ...profiles[0], details: { feelings: entries } }, profiles[1]]));
const routing = Router.routeAll([{ id: 'ab', source: 'a', target: 'b', size: { width: 60, height: 24 } }, { id: 'ba', source: 'b', target: 'a', size: { width: 80, height: 24 } }], new Map([['a', { x: 0, y: 0 }], ['b', { x: 480, y: 0 }]]));
assert.notEqual(routing.get('ab').path, routing.get('ba').path, 'Las dos direcciones tienen recorridos distintos');
const script = S.create('Sentimientos');
script.doc.content = [{ type: 'paragraph', attrs: { id: 'cue', kind: 'character' }, content: [{ type: 'text', text: 'VECINA' }] },
  { type: 'paragraph', attrs: { id: 'speech', kind: 'dialogue' }, content: [{ type: 'text', text: 'Buenas tardes.' }] }];
const source = { name: 'Sentimientos', documentName: 'Sentimientos.plano', payload: { version: 1, screenplay: script, characterProfiles: profiles,
  annotations: [], corrections: [], crew: {}, proofreading: { enabled: false, dictionary: '', ignored: [] } } };

(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(Archive.stringify(source)) });
    await page.waitForFunction(() => state.screenplay?.title === 'Sentimientos' && !state.busy);
    const openTree = async () => {
      await page.locator('#editor-home').click(); await page.locator('.script-card-open').click();
      await page.locator('#open-project-characters').click(); await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    };
    await openTree();
    const plus = id => page.locator('.relations-feeling-add[data-feeling-source="' + id + '"]');
    const node = id => page.locator('[data-character-key="' + id + '"]');
    const paths = page.locator('.relations-feeling-path');
    const editArrow = (from, to) => page.getByRole('button', { name: new RegExp('^Editar sentimiento de ' + from + '.* hacia ' + to + '.*:') });
    const feelingDialog = page.locator('.relations-feeling-dialog');
    const add = async (from, to, feeling) => {
      await plus(from).click(); await feelingDialog.getByLabel('Hacia quién', { exact: true }).selectOption(to);
      await feelingDialog.getByLabel('Qué siente', { exact: true }).selectOption(feeling);
      await feelingDialog.getByRole('button', { name: 'Guardar sentimiento' }).click();
      await feelingDialog.waitFor({ state: 'hidden' });
    };
    assert.equal(await plus('ana').count(), 1);
    const world = await page.locator('.relations-world').getAttribute('style');
    await plus('ana').click(); await feelingDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await page.locator('.relations-world').getAttribute('style'), world, 'El + abre el formulario sin arrastrar el lienzo');
    await add('ana', 'beto', 'Amor');
    assert.equal(await paths.count(), 1);
    assert.equal(await paths.first().getAttribute('stroke-width'), '1.4');
    assert.equal(await page.locator('.relations-feeling-arrow').count(), 1);
    assert((await page.locator('.relations-feeling-arrow').first().getAttribute('d')).endsWith('Z'));
    assert.equal(await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'beto').details?.feelings?.length || 0), 0);
    await add('beto', 'ana', 'Indiferencia');
    assert.equal(await paths.count(), 2);
    assert.equal(await page.locator('.relations-link').count(), 1);
    assert.equal(await page.locator('.relations-couple-link use[href="#i-rings"]').count(), 1);
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-direcciones.png') });
    await node('ana').locator('.relations-avatar').click();
    const ana = page.getByRole('dialog', { name: 'Ana', exact: true });
    await ana.getByText('Hacia Beto · Amor', { exact: true }).waitFor();
    await ana.getByText('De Beto · Indiferencia', { exact: true }).waitFor();
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    const hit = page.locator('.relations-feeling-hit').first();
    const point = await hit.evaluate(element => {
      const at = element.getPointAtLength(element.getTotalLength() * .25).matrixTransform(element.getScreenCTM());
      return { x: at.x, y: at.y };
    });
    await page.mouse.click(point.x, point.y);
    await feelingDialog.getByLabel('Qué siente', { exact: true }).selectOption('Rabia');
    await feelingDialog.getByRole('button', { name: 'Guardar sentimiento' }).click();
    await feelingDialog.waitFor({ state: 'hidden' });
    assert.equal(await editArrow('Ana', 'Beto').textContent(), 'Rabia');
    assert.equal(await editArrow('Beto', 'Ana').textContent(), 'Indiferencia');
    await plus('ana').click();
    await feelingDialog.getByLabel('Hacia quién', { exact: true }).selectOption('beto');
    assert.equal(await feelingDialog.getByLabel('Qué siente', { exact: true }).inputValue(), 'Rabia');
    await feelingDialog.getByRole('button', { name: 'Guardar sentimiento' }).click();
    await feelingDialog.waitFor({ state: 'hidden' });
    assert.equal(await paths.count(), 2, 'Actualizar la misma dirección no duplica la flecha');
    await node('ana').locator('.relations-avatar').click();
    await ana.getByRole('button', { name: 'Editar personaje' }).click();
    assert.equal(await page.locator('.character-dialog form').getByLabel('Qué siente', { exact: true }).count(), 1, 'La ficha edita sus sentimientos salientes');
    await page.locator('.character-dialog form').getByLabel('Qué siente', { exact: true }).selectOption('Admiración');
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await ana.getByText('Hacia Beto · Admiración', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-ficha.png') });
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await add('script:VECINA', 'ana', 'Miedo');
    const vecina = await page.evaluate(() => state.characterProfiles.find(profile => profile.givenNames === 'VECINA'));
    assert(vecina && vecina.details.feelings[0].targetId === 'ana', 'Crea la ficha de un personaje que solo estaba en el guion');
    assert.equal(await paths.count(), 3);
    const before = await paths.first().getAttribute('d');
    await node('ana').press('Shift+ArrowRight');
    await page.waitForFunction(() => document.querySelector('.relations-canvas').getAttribute('aria-busy') === 'false');
    assert.notEqual(await paths.first().getAttribute('d'), before, 'Las flechas siguen al personaje cuando se mueve');
    await editArrow('Beto', 'Ana').click();
    await feelingDialog.getByRole('button', { name: 'Quitar sentimiento' }).click();
    await feelingDialog.waitFor({ state: 'hidden' });
    assert.equal(await paths.count(), 2);
    assert.equal(await editArrow('Ana', 'Beto').textContent(), 'Admiración');
    const packed = await page.evaluate(() => PlanoProjectArchive.stringify({ name: 'Sentimientos', documentName: 'Sentimientos.plano', payload: {
      version: 1, screenplay: state.screenplay, characterProfiles: state.characterProfiles, annotations: [], corrections: [], crew: {}, proofreading: { enabled: false, dictionary: '', ignored: [] },
    } }));
    assert.equal(Archive.parse(packed).payload.characterProfiles.find(profile => profile.id === 'ana').details.feelings[0].feeling, 'Admiración');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles.find(profile => profile.id === 'ana').details.feelings[0].feeling), 'Admiración');
    await page.reload();
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Sentimientos' && !state.busy);
    await openTree();
    assert.equal(await paths.count(), 2);
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'dark' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await plus('ana').click();
    assert(await feelingDialog.evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(__dirname, '.output/sentimientos-movil.png') });
    await feelingDialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Sin personajes')));
    await openTree();
    assert.equal(await paths.count(), 0); assert.equal(await page.locator('.relations-feeling-add').count(), 0);
    assert.deepEqual(errors, []);
    console.log('OK: sentimientos dirigidos, flechas laterales, edición y borrado independientes, fichas, personajes del guion, arrastre, exportación, cambio de proyecto y móvil.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
