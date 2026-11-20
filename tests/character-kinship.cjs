const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Kinship = require('../character-kinship.js'), Details = require('../character-details.js');
const S = require('../screenplay.js'), Archive = require('../project-archive.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const people = [
  ['tomas', 'Tomás', 'Hombre', '80'], ['rosa', 'Rosa', 'Mujer', '78'],
  ['luis', 'Luis', 'Hombre', '50'], ['eva', 'Eva', 'Mujer', '48'], ['luz', 'Luz', 'Mujer', '47'], ['vera', 'Vera', 'Mujer', '45'],
  ['ana', 'Ana', 'Mujer', '26'], ['leo', 'Leo', 'Hombre', '24'], ['ines', 'Inés', 'Mujer', '20'], ['sol', 'Sol', 'No binario', '22'],
  ['dani', 'Dani', 'Hombre', '25'], ['noa', 'Noa', 'Mujer', '5'], ['mia', 'Mía', 'Mujer', '3'], ['lia', 'Lía', 'Mujer', '1'],
  ['amigo', 'Amigo', 'Hombre', '25'],
].map(([id, givenNames, gender, age]) => ({ id, givenNames, gender, age, surnames: '', role: '', aliases: [], details: { relationships: [] } }));
const byId = new Map(people.map(profile => [profile.id, profile]));
function children(parent, ...ids) {
  byId.get(parent).details.relationships.push(...ids.map(targetId => ({ targetId, type: 'Familia', parentId: parent })));
}
children('tomas', 'luis', 'eva'); children('rosa', 'luis', 'eva');
children('luis', 'ana', 'leo', 'ines', 'sol'); children('luz', 'ana', 'leo'); children('vera', 'ines');
children('eva', 'dani'); children('dani', 'noa'); children('leo', 'mia'); children('mia', 'lia');
byId.get('ana').details.relationships.push({ targetId: 'dani', type: 'Familia' }, { targetId: 'amigo', type: 'Amistad' });
const profiles = S.validateProfiles(people);
const relation = (owner, target, roster = profiles) => Kinship.forCharacter(roster, owner).find(entry => entry.targetId === target)?.label;
for (const [owner, target, label] of [
  ['ana', 'leo', 'Hermano'], ['leo', 'ana', 'Hermana'], ['ana', 'ines', 'Media hermana'], ['ana', 'sol', 'Hermano/a'],
  ['ana', 'tomas', 'Abuelo'], ['tomas', 'ana', 'Nieta'], ['tomas', 'mia', 'Bisnieta'], ['lia', 'tomas', 'Tatarabuelo'],
  ['ana', 'eva', 'Tía'], ['eva', 'ana', 'Sobrina'], ['mia', 'eva', 'Tía abuela'], ['eva', 'mia', 'Sobrina nieta'],
  ['lia', 'eva', 'Tía bisabuela'], ['eva', 'lia', 'Sobrina bisnieta'],
  ['ana', 'dani', 'Primo hermano'], ['dani', 'ana', 'Prima hermana'], ['mia', 'noa', 'Prima segunda'],
  ['ana', 'noa', 'Prima hermana (1 generación de diferencia)'],
]) assert.equal(relation(owner, target), label, owner + ' → ' + target);
assert.equal(relation('ana', 'amigo'), undefined, 'Una amistad no se interpreta como filiación');
assert.equal(relation('ana', 'vera'), undefined, 'Compartir una pareja con su madre no convierte a alguien en familiar');
assert.equal(Kinship.forCharacter(profiles, 'ana'), Kinship.forCharacter(profiles, 'ana'), 'Reutiliza los resultados de la misma versión del proyecto');
const displayed = Details.displayRelationshipsFor(profiles, 'ana');
assert.equal(displayed.filter(entry => entry.targetId === 'dani').length, 1, 'Enriquece el vínculo genérico sin duplicarlo');
assert.equal(displayed.find(entry => entry.targetId === 'dani').label, 'Primo hermano');
assert.equal(displayed.find(entry => entry.targetId === 'amigo').type, 'Amistad');
const disconnected = S.validateProfiles(profiles.map(profile => ['tomas', 'rosa'].includes(profile.id)
  ? { ...profile, details: { relationships: profile.details.relationships.filter(entry => entry.targetId !== 'luis') } } : profile));
assert.equal(relation('ana', 'eva', disconnected), undefined);
assert.equal(relation('ana', 'dani', disconnected), undefined);
assert.equal(relation('ana', 'leo', disconnected), 'Hermano');
assert.equal(Details.displayRelationshipsFor(disconnected, 'ana').find(entry => entry.targetId === 'dani').type, 'Familia');
const source = { name: 'Familia completa', documentName: 'Familia completa.plano', payload: {
  version: 1, screenplay: S.create('Familia completa'), characterProfiles: profiles, annotations: [], corrections: [], crew: {},
  proofreading: { enabled: false, dictionary: '', ignored: [] },
} };
const packed = Archive.stringify(source);
assert.deepEqual(Archive.parse(packed).payload.characterProfiles, profiles);
assert(!packed.includes('inferred') && !packed.includes('Primo hermano'), 'El proyecto guarda la filiación, no copias de las deducciones');

(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: source.documentName, mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Familia completa' && !state.busy);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    const node = id => page.locator('[data-character-key="' + id + '"]');
    const initialPaths = await page.locator('.relations-lines > path').count();
    assert.equal(await page.getByRole('button', { name: /^Editar Familia entre Ana.*Dani/ }).textContent(), 'Primo hermano');
    await node('ana').locator('.relations-avatar').hover();
    assert.equal(await node('dani').locator('.relations-node-kinship').textContent(), 'Primo hermano');
    assert(await node('dani').locator('.relations-node-kinship').isVisible());
    assert.equal(await node('eva').locator('.relations-node-kinship').textContent(), 'Tía');
    assert.equal(await node('tomas').locator('.relations-node-kinship').textContent(), 'Abuelo');
    assert.equal(await page.locator('.relations-lines > path').count(), initialPaths);
    await page.screenshot({ path: path.join(__dirname, '.output/parentescos-arbol.png') });
    await node('ana').locator('.relations-avatar').click();
    const ana = page.getByRole('dialog', { name: 'Ana', exact: true });
    const list = ana.locator('.character-profile-relations');
    await list.getByText('Dani · Primo hermano', { exact: false }).waitFor();
    assert.equal(await list.locator('li').filter({ hasText: 'Dani ·' }).count(), 1);
    assert(await list.getByText('Eva · Tía', { exact: false }).isVisible());
    await page.screenshot({ path: path.join(__dirname, '.output/parentescos-ficha.png') });
    const storedBefore = await page.evaluate(() => JSON.stringify(state.characterProfiles));
    await ana.getByRole('button', { name: 'Editar personaje' }).click();
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await ana.getByRole('button', { name: 'Cerrar ficha' }).waitFor();
    assert.equal(await page.evaluate(() => JSON.stringify(state.characterProfiles)), storedBefore, 'Guardar una ficha no guarda las deducciones');
    await ana.getByRole('button', { name: 'Cerrar ficha' }).click();
    await node('luis').locator('.relations-avatar').click();
    await page.getByRole('dialog', { name: 'Luis', exact: true }).getByRole('button', { name: 'Editar personaje' }).click();
    for (const parent of ['tomas', 'rosa']) {
      const index = await page.locator('.character-relation-row').evaluateAll((rows, parent) => rows.findIndex(row => row.querySelector('[id^=character-relation-target-]').value === parent), parent);
      await page.getByRole('button', { name: 'Quitar relación ' + (index + 1), exact: true }).click();
    }
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await page.getByRole('dialog', { name: 'Luis', exact: true }).getByRole('button', { name: 'Cerrar ficha' }).click();
    await node('ana').locator('.relations-avatar').hover();
    assert(await node('dani').locator('.relations-node-kinship').isHidden(), 'El árbol deja de mostrar el parentesco anterior');
    assert.equal(await page.getByRole('button', { name: /^Editar Familia entre Ana.*Dani/ }).textContent(), 'Familia');
    await node('ana').locator('.relations-avatar').click();
    assert.equal(await list.getByText('Eva · Tía', { exact: false }).count(), 0);
    assert.equal(await list.getByText('Dani · Primo hermano', { exact: false }).count(), 0);
    assert(await list.getByText('Dani · Familia', { exact: true }).isVisible());
    assert(await list.getByText('Leo · Hermano', { exact: false }).isVisible());
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await ana.evaluate(element => element.scrollWidth <= element.clientWidth));
    assert.deepEqual(errors, []);
    console.log('OK: hermanos/medios hermanos, abuelos y bisabuelos, tíos/sobrinos, primos y generaciones, fichas, árbol, recálculo y guardado sin duplicados.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
