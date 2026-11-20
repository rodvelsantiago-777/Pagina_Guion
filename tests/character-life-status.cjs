const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js'), Details = require('../character-details.js'), Archive = require('../project-archive.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const base = { surnames: '', age: '30', role: '', aliases: [] };
const profiles = S.validateProfiles([
  { ...base, id: 'ana', givenNames: 'Ana', gender: 'Mujer', relationshipPosition: { x: -360, y: 0 },
    avatar: { v: 3, pelo: 'largo', ropa: '#486D70' }, details: { startStatus: 'Vivo', maritalStatus: 'Casado/a' } },
  { ...base, id: 'bruno', givenNames: 'Bruno', gender: 'Hombre', relationshipPosition: { x: -120, y: 0 },
    avatar: { v: 3, pelo: 'corto', vestuario: 'traje', ropa: '#3F4760' },
    details: { startStatus: 'Muerto', maritalStatus: 'Casado/a', relationships: [{ targetId: 'ana', type: 'Romance' }] } },
  { ...base, id: 'clara', givenNames: 'Clara', gender: 'Mujer', relationshipPosition: { x: 120, y: 0 },
    avatar: { v: 3, pelo: 'largo', cabello: '#B67E3F', ropa: '#728C5E' }, details: { startStatus: 'Desaparecido' } },
  { ...base, id: 'diego', givenNames: 'Diego', gender: '', relationshipPosition: { x: 360, y: 0 }, details: { startStatus: 'Desconocido' } },
]);
assert.equal(Details.lifeState(profiles[0]), 'alive');
assert.equal(Details.lifeState(profiles[1]), 'dead');
assert.equal(Details.lifeState(profiles[2]), 'missing');
assert.equal(Details.lifeState(profiles[3]), 'unknown');
for (const [text, state] of [['Fallecida', 'dead'], ['muerta', 'dead'], ['Desaparecida', 'missing'], ['En paradero desconocido', 'missing'], ['Desconocido', 'unknown']]) assert.equal(Details.lifeState({ details: { startStatus: text } }), state);
assert.equal(Details.lifeStateLabel(profiles[2]), 'Desaparecida');
assert.deepEqual(Details.maritalState(profiles, 'ana'), { value: 'Viudo/a', label: 'Viuda', automatic: true, partners: ['bruno'] });
const change = (id, details) => S.validateProfiles(profiles.map(profile => profile.id === id ? { ...profile, details: { ...profile.details, ...details } } : profile));
for (const status of ['Vivo', 'Desaparecido', 'Desconocido']) assert.equal(Details.maritalState(change('bruno', { startStatus: status }), 'ana').automatic, false);
assert.equal(Details.maritalState(change('bruno', { relationships: [] }), 'ana').label, 'Casado/a');
assert.equal(Details.maritalState(change('ana', { maritalStatus: 'Divorciado/a' }), 'ana').automatic, false);
assert.equal(Details.maritalState(change('ana', { startStatus: 'Muerto' }), 'ana').automatic, false);
assert.equal(Details.maritalState(change('ana', { relationships: [{ targetId: 'clara', type: 'Romance' }] }), 'ana').automatic, false, 'Una pareja desaparecida no se da por fallecida');
const unrecorded = change('ana', { maritalStatus: '' });
assert.equal(Details.maritalState(unrecorded, 'ana').label, 'Viuda');
assert.equal(profiles[0].details.maritalStatus, 'Casado/a', 'La deducción conserva el dato escrito por la persona');
const source = { name: 'Estados', documentName: 'Estados.plano', payload: { version: 1, screenplay: S.create('Estados'),
  characterProfiles: profiles, annotations: [], corrections: [], crew: {}, proofreading: { enabled: false, dictionary: '', ignored: [] } } };
const packed = Archive.stringify(source);
assert.equal(Details.maritalState(Archive.parse(packed).payload.characterProfiles, 'ana').label, 'Viuda');

(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Estados' && !state.busy);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    const node = id => page.locator('[data-character-key="' + id + '"]');
    assert.equal(await node('ana').getAttribute('data-life-state'), 'alive');
    assert.equal(await node('ana').locator('.relations-life-mark').count(), 0);
    assert.equal(await node('bruno').locator('.relations-avatar').evaluate(element => getComputedStyle(element).filter), 'grayscale(1)');
    assert.equal(await node('bruno').locator('.relations-life-mark use').getAttribute('href'), '#i-mourning');
    assert.equal(await node('clara').locator('.relations-avatar > svg').evaluate(element => getComputedStyle(element).filter), 'brightness(0)');
    assert.equal(await node('clara').locator('.relations-life-mark use').getAttribute('href'), '#i-missing');
    assert.equal(await node('diego').locator('.relations-life-mark').count(), 0);
    assert((await node('clara').getAttribute('aria-label')).includes('Desaparecida'));
    await page.screenshot({ path: path.join(__dirname, '.output/estados-arbol.png') });
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'dark' }));
    await page.screenshot({ path: path.join(__dirname, '.output/estados-arbol-oscuro.png') });
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'light' }));
    await node('ana').locator('.relations-avatar').click();
    const ana = page.getByRole('dialog', { name: 'Ana', exact: true });
    await ana.locator('dd').filter({ hasText: 'Viuda' }).waitFor();
    await page.screenshot({ path: path.join(__dirname, '.output/estados-viudez.png') });
    await ana.getByRole('button', { name: 'Editar personaje' }).click();
    assert.equal(await page.getByLabel('Estado civil', { exact: true }).inputValue(), 'Viudo/a');
    assert(await page.getByLabel('Estado civil', { exact: true }).isDisabled());
    await page.getByLabel('Acerca de', { exact: true }).fill('Descripción conservada al guardar.');
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await ana.getByRole('button', { name: 'Cerrar ficha' }).waitFor();
    assert.equal(await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'ana').details.maritalStatus), 'Casado/a');
    assert(await ana.locator('dd').filter({ hasText: 'Viuda' }).isVisible());
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    const editState = async (id, status) => {
      await node(id).locator('.relations-avatar').click();
      const card = page.getByRole('dialog', { name: profiles.find(profile => profile.id === id).givenNames, exact: true });
      await card.getByRole('button', { name: 'Editar personaje' }).click();
      await page.getByLabel('Estado al inicio de la historia', { exact: true }).selectOption(status);
      await page.getByRole('button', { name: 'Guardar personaje' }).click();
      await card.getByRole('button', { name: 'Cerrar ficha' }).click();
    };
    await editState('bruno', 'Vivo');
    assert.equal(await node('bruno').locator('.relations-life-mark').count(), 0);
    assert.equal(await node('bruno').locator('.relations-avatar').evaluate(element => getComputedStyle(element).filter), 'none');
    await node('ana').locator('.relations-avatar').click();
    assert(await ana.locator('dd').filter({ hasText: /^Casado\/a$/ }).isVisible());
    assert.equal(await ana.locator('dd').filter({ hasText: 'Viuda' }).count(), 0);
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await editState('clara', 'Vivo');
    assert.equal(await node('clara').locator('.relations-avatar > svg').evaluate(element => getComputedStyle(element).filter), 'none');
    assert.equal(await node('clara').locator('.relations-life-mark').count(), 0);
    assert.deepEqual(await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'clara').avatar), profiles[2].avatar);
    await editState('bruno', 'Muerto');
    await editState('clara', 'Desaparecido');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles);
    assert.equal(Details.maritalState(stored, 'ana').label, 'Viuda');
    assert.equal(Details.lifeState(stored.find(profile => profile.id === 'clara')), 'missing');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    assert(await page.locator('#characters-relations-panel').evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(__dirname, '.output/estados-arbol-movil.png') });
    assert.deepEqual(errors, []);
    console.log('OK: vivos, luto y gris, silueta e interrogación, viudez recíproca, corrección de estados, avatares intactos, guardado y móvil.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
