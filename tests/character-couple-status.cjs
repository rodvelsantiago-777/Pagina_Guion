const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js'), Details = require('../character-details.js'), Archive = require('../project-archive.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const base = { surnames: '', role: '', aliases: [] };
const profiles = S.validateProfiles([
  { ...base, id: 'ana', givenNames: 'Ana', gender: 'Mujer', age: '35', relationshipPosition: { x: 0, y: 0 },
    details: { startStatus: 'Vivo', relationships: [{ targetId: 'beto', type: 'Romance' }, { targetId: 'carlos', type: 'Familia', parentId: 'ana' }] } },
  { ...base, id: 'beto', givenNames: 'Beto', gender: 'Hombre', age: '35', relationshipPosition: { x: 480, y: 0 },
    details: { startStatus: 'Vivo', relationships: [{ targetId: 'carlos', type: 'Familia', parentId: 'beto' }] } },
  { ...base, id: 'carlos', givenNames: 'Carlos', gender: 'Hombre', age: '5', relationshipPosition: { x: 240, y: 240 } },
]);
function update(roster, id, targetId, married, broken) {
  const owner = roster.find(profile => profile.id === id);
  return S.validateProfiles(Details.updateRelationships(roster, { ...owner, details: { ...owner.details,
    relationships: Details.relationshipsFor(roster, id).map(entry => entry.targetId === targetId && entry.type === 'Romance' ? { ...entry, married, broken } : entry),
  } }));
}
for (const [married, broken, forward, reverse] of [[false, false, 'Pareja', 'Pareja'], [false, true, 'Expareja', 'Expareja'], [true, false, 'Esposo', 'Esposa'], [true, true, 'Exesposo', 'Exesposa']]) {
  const roster = update(profiles, 'beto', 'ana', married, broken);
  assert.equal(Details.relationshipLabel(Details.relationshipsFor(roster, 'ana').find(entry => entry.targetId === 'beto'), roster), forward);
  assert.equal(Details.relationshipLabel(Details.relationshipsFor(roster, 'beto').find(entry => entry.targetId === 'ana'), roster), reverse);
  if (married) assert.equal(Details.maritalState(roster, 'ana').value, broken ? 'Divorciado/a' : 'Casado/a');
  assert.equal(Details.familyFor(roster, 'carlos').filter(entry => entry.distance === 1).length, 2, 'Conserva ambos progenitores');
}
const mirror = S.validateProfiles([profiles[0], { ...profiles[1], details: { ...profiles[1].details, relationships: [...profiles[1].details.relationships, { targetId: 'ana', type: 'Romance' }] } }, profiles[2]]);
assert(update(mirror, 'beto', 'ana', true, true).flatMap(profile => profile.details?.relationships || []).filter(entry => entry.type === 'Romance').every(entry => entry.married && entry.broken));
const deadEx = update(profiles, 'ana', 'beto', true, true).map(profile => profile.id === 'beto' ? { ...profile, details: { ...profile.details, startStatus: 'Muerto' } } : profile);
assert.equal(Details.maritalState(deadEx, 'ana').label, 'Divorciada', 'Un excónyuge fallecido no produce viudez');
assert.equal(Details.maritalState(update(deadEx, 'ana', 'beto', true, false), 'ana').label, 'Viuda');
assert.equal(Details.relationshipLabel({ targetId: 'ana', type: 'Esposa', married: false, broken: true }, profiles), 'Expareja');
for (const entry of [{ targetId: 'beto', type: 'Romance', married: 'sí' }, { targetId: 'beto', type: 'Familia', broken: true }])
  assert.throws(() => S.validateProfiles([{ ...profiles[0], details: { relationships: [entry] } }, ...profiles.slice(1)]), /matrimonio y ruptura/);
const source = { name: 'Pareja', documentName: 'Pareja.plano', payload: { version: 1, screenplay: S.create('Pareja'), characterProfiles: profiles,
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
    await page.waitForFunction(() => state.screenplay?.title === 'Pareja' && !state.busy);
    const openTree = async () => {
      await page.locator('#editor-home').click();
      await page.locator('.script-card-open').click();
      await page.locator('#open-project-characters').click();
      await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    };
    await openTree();
    const link = page.getByRole('button', { name: /^Editar Romance entre Ana.*Beto/ });
    const dialog = page.getByRole('dialog', { name: 'Editar relación', exact: true });
    const node = id => page.locator('[data-character-key="' + id + '"]');
    const flags = async (married, broken) => {
      await link.click();
      await dialog.getByRole('checkbox', { name: 'Casados', exact: true }).setChecked(married);
      await dialog.getByRole('checkbox', { name: 'Ruptura', exact: true }).setChecked(broken);
      await dialog.getByRole('button', { name: 'Guardar relación' }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.relations-family-branch').count(), 1);
    };
    await flags(false, true);
    assert.equal(await link.locator('use[href="#i-heart-broken"]').count(), 1);
    assert.equal(await link.locator('use[href="#i-rings"]').count(), 0);
    assert.equal(await link.textContent(), 'Expareja');
    await node('ana').locator('.relations-avatar').click();
    const ana = page.getByRole('dialog', { name: 'Ana', exact: true });
    await ana.getByText('Beto · Expareja', { exact: true }).waitFor();
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await flags(true, false);
    assert.equal(await link.locator('use[href="#i-rings"]').count(), 1);
    assert.equal(await link.locator('use[href="#i-heart-broken"]').count(), 0);
    await node('ana').locator('.relations-avatar').click();
    await ana.getByText('Beto · Esposo', { exact: true }).waitFor();
    assert(await ana.locator('dd').filter({ hasText: 'Casada' }).isVisible());
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await flags(true, true);
    assert.equal(await link.locator('use').count(), 2);
    assert.equal(await link.textContent(), 'Excónyuges');
    await page.screenshot({ path: path.join(__dirname, '.output/pareja-ruptura-matrimonio.png') });
    await link.click();
    assert(await dialog.getByRole('checkbox', { name: 'Casados', exact: true }).isChecked());
    assert(await dialog.getByRole('checkbox', { name: 'Ruptura', exact: true }).isChecked());
    await page.screenshot({ path: path.join(__dirname, '.output/pareja-opciones.png') });
    await dialog.getByRole('checkbox', { name: 'Ruptura', exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await link.textContent(), 'Excónyuges', 'Cancelar conserva las opciones guardadas');
    await node('ana').locator('.relations-avatar').click();
    await ana.getByText('Beto · Exesposo', { exact: true }).waitFor();
    assert(await ana.locator('dd').filter({ hasText: 'Divorciada' }).isVisible());
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await node('beto').locator('.relations-avatar').click();
    const beto = page.getByRole('dialog', { name: 'Beto', exact: true });
    await beto.getByText('Ana · Exesposa', { exact: true }).waitFor();
    await beto.getByRole('button', { name: 'Editar personaje' }).click();
    const checks = page.getByRole('dialog');
    assert(await checks.getByRole('checkbox', { name: 'Casados', exact: true }).isChecked());
    assert(await checks.getByRole('checkbox', { name: 'Ruptura', exact: true }).isChecked());
    await checks.getByRole('checkbox', { name: 'Casados', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await beto.getByText('Ana · Expareja', { exact: true }).waitFor();
    await beto.getByRole('button', { name: 'Cerrar ficha' }).click();
    assert.equal(await link.textContent(), 'Expareja', 'Editar la ficha receptora actualiza la misma relación');
    assert.equal(await page.evaluate(() => state.characterProfiles.flatMap(profile => profile.details?.relationships || []).filter(entry => entry.type === 'Romance').length), 1);
    await node('beto').locator('.relations-avatar').click();
    await beto.getByRole('button', { name: 'Editar personaje' }).click();
    await page.getByLabel('Estado al inicio de la historia', { exact: true }).selectOption('Muerto');
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await beto.getByRole('button', { name: 'Cerrar ficha' }).click();
    assert.notEqual(await page.evaluate(() => PlanoCharacterDetails.maritalState(state.characterProfiles, 'ana').value), 'Viudo/a');
    await flags(true, true);
    assert.equal(await page.evaluate(() => PlanoCharacterDetails.maritalState(state.characterProfiles, 'ana').value), 'Divorciado/a');
    await flags(true, false);
    assert.equal(await page.evaluate(() => PlanoCharacterDetails.maritalState(state.characterProfiles, 'ana').value), 'Viudo/a');
    await flags(true, true);
    const packed = await page.evaluate(() => PlanoProjectArchive.stringify({ name: 'Pareja', documentName: 'Pareja.plano', payload: {
      version: 1, screenplay: state.screenplay, characterProfiles: state.characterProfiles, annotations: [], corrections: [], crew: {}, proofreading: { enabled: false, dictionary: '', ignored: [] },
    } }));
    assert.equal(Details.relationshipsFor(Archive.parse(packed).payload.characterProfiles, 'beto').find(entry => entry.type === 'Romance').broken, true);
    await page.reload();
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Pareja' && !state.busy);
    await openTree();
    assert.equal(await link.locator('use').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await link.click();
    assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(__dirname, '.output/pareja-opciones-movil.png') });
    assert.deepEqual(errors, []);
    console.log('OK: ruptura, matrimonio, anillos/corazón, exesposos recíprocos, fichas, hijos conservados, viudez corregida, cancelación, exportación y móvil.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
