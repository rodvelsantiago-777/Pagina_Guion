const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js'), Details = require('../character-details.js');
const Family = require('../character-family.js'), Archive = require('../project-archive.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const base = { surnames: '', age: '', role: '', aliases: [] };
const profiles = S.validateProfiles([
  { ...base, id: 'ana', givenNames: 'Ana', gender: 'Mujer', relationshipPosition: { x: 0, y: 0 },
    details: { relationships: [{ targetId: 'beto', type: 'Romance' }, { targetId: 'clara', type: 'Familia' }] } },
  { ...base, id: 'beto', givenNames: 'Beto', gender: 'Hombre', relationshipPosition: { x: 480, y: 0 } },
  { ...base, id: 'clara', givenNames: 'Clara', gender: 'Mujer', relationshipPosition: { x: 0, y: 240 } },
]);
let family = Details.updateRelationships(profiles, { ...profiles[0], details: { relationships: [
  profiles[0].details.relationships[0], { targetId: 'clara', type: 'Familia', parentId: 'ana' },
] } });
family = S.validateProfiles(family);
assert.equal(Details.relationshipLabel(Details.relationshipsFor(family, 'clara')[0], family), 'Madre');
assert.equal(Details.relationshipLabel(Details.relationshipsFor(family, 'ana').find(entry => entry.targetId === 'clara'), family), 'Hija');
assert.equal(Details.parentTitle({ gender: 'No binario' }), 'Progenitor/a');
// Cambiar el parentesco desde la ficha receptora modifica el registro original.
const reverse = Details.relationshipsFor(family, 'clara').map(entry => ({ ...entry, parentId: 'clara' }));
const changed = S.validateProfiles(Details.updateRelationships(family, { ...family[2], details: { relationships: reverse } }));
assert.equal(changed[0].details.relationships.find(entry => entry.targetId === 'clara').parentId, 'clara');
assert.throws(() => S.validateProfiles([{ ...profiles[0], details: { relationships: [{ targetId: 'clara', type: 'Familia', parentId: 'beto' }] } }, ...profiles.slice(1)]), /progenitor/);
assert.throws(() => S.validateProfiles([
  { ...profiles[0], details: { relationships: [{ targetId: 'beto', type: 'Familia', parentId: 'ana' }] } },
  { ...profiles[1], details: { relationships: [{ targetId: 'clara', type: 'Familia', parentId: 'beto' }] } },
  { ...profiles[2], details: { relationships: [{ targetId: 'ana', type: 'Familia', parentId: 'clara' }] } },
]), /ciclo/);
for (const [dx, dy] of [[82, 14], [-31, 94], [88, 64], [-67, -89], [8, -140], [150, -70]]) {
  const at = Family.guidedPosition({ x: 0, y: 0 }, dx, dy);
  assert(at.x === 0 || at.y === 0 || Math.abs(at.x) === Math.abs(at.y), 'Solo ocho direcciones');
}
const diagonalLinks = [{ source: 'ana', target: 'beto', type: 'Romance' }, { source: 'ana', target: 'clara', type: 'Familia', parentId: 'ana' }];
const diagonalPositions = new Map([['ana', { x: 0, y: 0 }], ['beto', { x: 240, y: 240 }], ['clara', { x: 0, y: 480 }]]);
assert.deepEqual(Family.joinFor('clara', { x: 120, y: 120 }, diagonalPositions, diagonalLinks).parents, ['ana', 'beto'], 'También se puede soltar sobre una relación diagonal');
const packed = Archive.stringify({ name: 'La familia', documentName: 'La familia.plano', payload: {
  version: 1, screenplay: S.create('La familia'), characterProfiles: profiles, annotations: [], corrections: [], crew: {},
  proofreading: { enabled: false, dictionary: '', ignored: [] },
} });

(async () => {
  const browser = await launch(chromium, { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } }), errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Inicial')));
    await page.locator('#file-input').setInputFiles({ name: 'La familia.plano', mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'La familia' && !state.busy);
    const openTree = async () => {
      await page.locator('.script-card-open').click();
      await page.locator('#open-project-characters').click();
      await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
      await page.locator('.relations-node').first().waitFor();
    };
    await page.locator('#editor-home').click();
    await openTree();
    const graph = page.locator('#characters-relations-panel');
    const node = id => graph.locator('[data-character-key="' + id + '"]');
    const position = id => page.evaluate(id => state.characterProfiles.find(profile => profile.id === id).relationshipPosition, id);
    const drag = async (id, dx, dy) => {
      const box = await node(id).locator('.relations-avatar').boundingBox();
      const scale = await graph.locator('[data-zoom-value]').textContent();
      const zoom = parseInt(scale) / 100;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx * zoom, box.y + box.height / 2 + dy * zoom, { steps: 8 });
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('.relations-canvas').getAttribute('aria-busy') === 'false');
    };
    await drag('clara', 82, 14);
    assert.deepEqual(await position('clara'), { x: 72, y: 240 }, 'El arrastre se mantiene horizontal');
    await drag('clara', -72, 72);
    assert.deepEqual(await position('clara'), { x: 0, y: 312 });
    await page.waitForFunction(() => PlanoCharacterDetails.relationshipsFor(state.characterProfiles, 'clara')[0]?.parentId === 'ana');
    await node('clara').click();
    let card = page.getByRole('dialog', { name: 'Clara', exact: true });
    await card.getByText('Ana · Madre', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Cerrar ficha' }).click();
    await node('ana').click();
    await page.getByRole('dialog', { name: 'Ana', exact: true }).getByText('Clara · Hija', { exact: true }).waitFor();
    await page.getByRole('dialog', { name: 'Ana', exact: true }).getByRole('button', { name: 'Cerrar ficha' }).click();
    const from = await node('clara').locator('.relations-avatar').boundingBox();
    const a = await node('ana').locator('.relations-avatar').boundingBox(), b = await node('beto').locator('.relations-avatar').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move((a.x + a.width / 2 + b.x + b.width / 2) / 2, (a.y + a.height / 2 + b.y + b.height / 2) / 2, { steps: 12 });
    await graph.getByRole('status').getByText(/Suelta para añadir/).waitFor();
    await page.screenshot({ path: path.join(__dirname, '.output/familia-soltar-en-relacion.png') });
    await page.mouse.up();
    await page.waitForFunction(() => PlanoCharacterDetails.relationshipsFor(state.characterProfiles, 'clara').filter(entry => entry.parentId).length === 2);
    assert.deepEqual(await position('clara'), { x: 240, y: 240 });
    assert.equal(await graph.locator('.relations-family-branch').count(), 1);
    await page.screenshot({ path: path.join(__dirname, '.output/familia-dos-progenitores.png') });
    await graph.getByRole('button', { name: /^Ver progenitores de Clara/ }).click();
    card = page.getByRole('dialog', { name: 'Clara', exact: true });
    await card.getByText('Ana · Madre', { exact: true }).waitFor();
    await card.getByText('Beto · Padre', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Editar personaje' }).click();
    const index = await page.locator('.character-relation-row').evaluateAll(rows => rows.findIndex(row => row.querySelector('[id^=character-relation-target-]').value === 'beto'));
    await page.locator('#character-relation-parent-' + index).selectOption('');
    await page.getByRole('button', { name: 'Guardar personaje' }).click();
    await card.getByText('Beto · Familia', { exact: true }).waitFor();
    await card.getByRole('button', { name: 'Cerrar ficha' }).click();
    assert.equal(await graph.locator('.relations-family-branch').count(), 0);
    // Corregir también desde el árbol y volver a abrir conserva ambas direcciones.
    await graph.getByRole('button', { name: /^Editar Familia entre Beto/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar relación', exact: true });
    await dialog.getByLabel('Progenitor', { exact: true }).selectOption('beto');
    await dialog.getByRole('button', { name: 'Guardar relación' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const exported = await page.evaluate(() => PlanoProjectArchive.stringify({ name: 'La familia', documentName: 'La familia.plano', payload: {
      version: 1, screenplay: state.screenplay, characterProfiles: state.characterProfiles, annotations: [], corrections: [], crew: {},
      proofreading: { enabled: false, dictionary: '', ignored: [] },
    } }));
    assert.equal(Details.relationshipsFor(Archive.parse(exported).payload.characterProfiles, 'clara').filter(entry => entry.parentId).length, 2);
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles);
    assert.equal(Details.relationshipsFor(draft, 'clara').filter(entry => entry.parentId).length, 2);
    await page.reload();
    // La cuenta de prueba no tiene servidor. Restaurar el archivo prueba la lectura persistida tras una recarga.
    await page.locator('#file-input').setInputFiles({ name: 'La familia.plano', mimeType: 'application/json', buffer: Buffer.from(exported) });
    await page.waitForFunction(() => state.screenplay?.title === 'La familia' && !state.busy);
    await page.locator('#editor-home').click();
    await openTree();
    assert.equal(await graph.locator('.relations-family-branch').count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await graph.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await page.screenshot({ path: path.join(__dirname, '.output/familia-movil.png') });
    assert(await graph.evaluate(element => element.scrollWidth <= element.clientWidth));
    assert.deepEqual(errors, []);
    console.log('OK: ocho direcciones, madre e hija recíprocas, dos progenitores desde su relación, corrección en fichas/árbol, recarga, exportación y ciclos.');
  } finally { await browser.close(); }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
