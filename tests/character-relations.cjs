const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');
const S = require('../screenplay.js'), Archive = require('../project-archive.js');
const script = S.create('Las visitas');
const paragraph = (id, kind, text) => ({ type: 'paragraph', attrs: { id, kind }, content: [{ type: 'text', text }] });
script.doc.content = [paragraph('scene', 'scene', 'INT. CASA - DÍA'), paragraph('cue', 'character', 'VECINA'), paragraph('speech', 'dialogue', 'Buenas noches.')];
const base = { surnames: '', gender: '', role: '', aliases: [] };
const profiles = S.validateProfiles([
  { ...base, id: 'ana', givenNames: 'Ana', surnames: 'Suárez', age: '26', aliases: ['Anita'], primaryAlias: 'Anita',
    avatar: { v: 3, pelo: 'largo', formaOjos: 'abiertos' },
    details: { relationships: [{ targetId: 'beto', type: 'Familia' }, { targetId: 'beto', type: 'Amistad' }] } },
  { ...base, id: 'beto', givenNames: 'Beto', age: '28', details: { relationships: [{ targetId: 'ana', type: 'Familia' }] } },
  { ...base, id: 'clara', givenNames: 'Clara', age: '', details: { relationships: [{ targetId: 'ana', type: 'Romance' }] } },
]);
const payload = { version: 1, screenplay: script, annotations: [], corrections: [], crew: {}, characterProfiles: profiles,
  proofreading: { enabled: false, dictionary: '', ignored: [] } };
const packed = Archive.stringify({ name: 'Las visitas', documentName: 'Las visitas.plano', payload });
const out = path.join(__dirname, '.output');

(async () => {
  const browser = await launch(chromium, {
    executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const fullPageSection = async () => {
      const layout = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const section = rect('#project-characters'), header = rect('.topbar');
        const panel = rect('#project-characters > [role=tabpanel]:not([hidden])');
        return { left: section.left, width: section.width, top: section.top, headerBottom: header.bottom,
          bottom: panel.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
          pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight };
      });
      assert.equal(layout.left, 0);
      assert.equal(layout.width, layout.viewportWidth, 'La sección ocupa todo el ancho');
      assert.equal(layout.top, layout.headerBottom, 'La barra de secciones sigue a la cabecera');
      assert.equal(layout.bottom, layout.viewportHeight, 'La vista llega al final de la pantalla');
      assert.equal(layout.pageWidth, layout.viewportWidth, 'Sin desbordamiento horizontal');
      assert.equal(layout.pageHeight, layout.viewportHeight, 'El contenido se desplaza dentro de su vista');
    };
    const errors = [];
    page.on('pageerror', reason => errors.push(reason.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Proyecto inicial')));
    await page.locator('#file-input').setInputFiles({ name: 'Las visitas.plano', mimeType: 'application/json', buffer: Buffer.from(packed) });
    await page.waitForFunction(() => state.screenplay?.title === 'Las visitas' && !state.busy);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await fullPageSection();
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    await fullPageSection();
    const canvas = page.getByRole('region', { name: /^Lienzo de relaciones/ });
    const graph = page.locator('#characters-relations-panel');
    const nodes = graph.locator('.relations-node');
    assert.equal(await nodes.count(), 4);
    assert.deepEqual(await nodes.locator('.relations-node-name').allTextContents(), ['Anita (26)', 'Beto (28)', 'Clara', 'VECINA']);
    assert.equal(await graph.locator('.relations-link').count(), 3);
    assert.equal(await graph.locator('.relations-lines > path').count(), 3);
    assert.equal(new Set(await graph.locator('.relations-lines > path').evaluateAll(paths => paths.map(item => item.getAttribute('stroke')))).size, 3);
    const defaultAvatars = await nodes.filter({ hasText: 'Beto' }).locator('svg').innerHTML();
    assert.equal(await nodes.filter({ hasText: 'VECINA' }).locator('svg').innerHTML(), defaultAvatars);
    await nodes.filter({ hasText: 'Anita' }).click();
    const profile = page.getByRole('dialog', { name: 'Ana Suárez', exact: true });
    await profile.waitFor();
    await profile.getByRole('button', { name: 'Cerrar ficha' }).click();
    const positionBefore = await nodes.filter({ hasText: 'Anita' }).getAttribute('style');
    const box = await nodes.filter({ hasText: 'Anita' }).locator('.relations-avatar').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 55, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => state.characterProfiles.find(profile => profile.id === 'ana').relationshipPosition);
    const savedPosition = await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'ana').relationshipPosition);
    assert.notEqual(await nodes.filter({ hasText: 'Anita' }).getAttribute('style'), positionBefore);
    assert(await profile.isHidden(), 'Arrastrar un personaje no abre su ficha');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles.find(profile => profile.id === 'ana').relationshipPosition), savedPosition);
    await graph.getByRole('button', { name: 'Acercar árbol' }).click();
    await page.waitForFunction(() => document.querySelector('[data-zoom-value]').textContent !== '100%');
    await graph.getByRole('button', { name: 'Ajustar', exact: true }).click();
    const beforePan = await graph.locator('.relations-world').getAttribute('style');
    await canvas.hover({ position: { x: 15, y: 15 } });
    await page.mouse.wheel(0, 65);
    await page.waitForFunction(value => document.querySelector('.relations-world').getAttribute('style') !== value, beforePan);
    await graph.getByRole('button', { name: 'Ajustar', exact: true }).click();
    await graph.getByRole('button', { name: /^Editar Familia entre/ }).click();
    const relation = page.getByRole('dialog', { name: 'Editar relación', exact: true });
    await relation.getByLabel('Tipo de relación', { exact: true }).selectOption('Mentoría');
    await relation.getByRole('button', { name: 'Guardar relación' }).click();
    await relation.waitFor({ state: 'hidden' });
    assert.equal(await graph.getByRole('button', { name: /^Editar Familia entre/ }).count(), 0);
    assert.equal(await graph.getByRole('button', { name: /^Editar Mentoría entre/ }).count(), 1);
    await graph.getByRole('button', { name: /^Editar Romance entre/ }).click();
    await relation.getByRole('button', { name: 'Quitar relación' }).click();
    await relation.waitFor({ state: 'hidden' });
    assert.equal(await graph.locator('.relations-link').count(), 2);
    await graph.getByRole('button', { name: 'Añadir relación' }).click();
    const add = page.getByRole('dialog', { name: 'Añadir relación', exact: true });
    await add.getByLabel('Personaje', { exact: true }).selectOption('ana');
    await add.getByLabel('Relacionado con', { exact: true }).selectOption({ label: 'VECINA' });
    await add.getByLabel('Tipo de relación', { exact: true }).selectOption('Conocidos');
    await add.getByRole('button', { name: 'Guardar relación' }).click();
    await add.waitFor({ state: 'hidden' });
    assert.equal(await graph.locator('.relations-link').count(), 3);
    assert.equal(await page.evaluate(() => state.characterProfiles.length), 4);
    await graph.getByRole('button', { name: 'Añadir relación' }).click();
    await add.getByLabel('Personaje', { exact: true }).selectOption('ana');
    await add.getByLabel('Relacionado con', { exact: true }).selectOption('beto');
    await add.getByLabel('Tipo de relación', { exact: true }).selectOption('Amistad');
    await add.getByRole('button', { name: 'Guardar relación' }).click();
    await add.getByRole('alert').getByText('Esa relación ya está añadida.').waitFor();
    assert.equal(await graph.locator('.relations-link').count(), 3);
    await add.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'arbol-relaciones.png') });
    const arrangedPosition = await nodes.filter({ hasText: 'Anita' }).getAttribute('style');
    await page.getByRole('tab', { name: 'Personajes', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'personajes-seccion-completa.png') });
    await page.locator('.character-card').filter({ hasText: 'VECINA' }).click();
    await page.getByRole('dialog', { name: 'VECINA', exact: true }).getByText('Ana Suárez · Conocidos', { exact: true }).waitFor();
    await page.getByRole('dialog', { name: 'VECINA', exact: true }).getByRole('button', { name: 'Cerrar ficha' }).click();
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    assert.equal(await page.evaluate(() => state.characterProfiles.find(profile => profile.id === 'ana').relationshipPosition), undefined);
    assert.equal(await nodes.filter({ hasText: 'Anita' }).getAttribute('style'), arrangedPosition, 'Cambiar de pestaña conserva la organización automática');
    await page.setViewportSize({ width: 390, height: 844 });
    await fullPageSection();
    await graph.getByRole('button', { name: 'Ajustar', exact: true }).click();
    assert(await graph.evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'dark' }));
    await page.screenshot({ path: path.join(out, 'arbol-relaciones-movil.png') });
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).press('ArrowLeft');
    assert.equal(await page.getByRole('tab', { name: 'Personajes', exact: true }).getAttribute('aria-selected'), 'true');
    await fullPageSection();
    await page.screenshot({ path: path.join(out, 'personajes-seccion-movil.png') });
    await page.getByRole('tab', { name: 'Personajes', exact: true }).press('ArrowRight');
    const exported = await page.evaluate(() => PlanoProjectArchive.stringify({
      name: 'Las visitas', documentName: 'Las visitas.plano', payload: { version: 1, screenplay: state.screenplay, characterProfiles: state.characterProfiles, annotations: [], corrections: [], crew: {} },
    }));
    assert.equal(Archive.parse(exported).payload.characterProfiles.find(profile => profile.id === 'ana').relationshipPosition, undefined, 'Cambiar vínculos devuelve el bloque afectado a la distribución automática');
    const bad = S.validateProfiles([{ ...profiles[0], details: undefined, relationshipPosition: { x: Infinity, y: 0 } }])[0];
    assert.equal(bad.relationshipPosition, undefined);
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Proyecto sin reparto')));
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await page.getByRole('tab', { name: 'Árbol de relaciones' }).click();
    assert.equal(await nodes.count(), 0);
    assert.equal(await graph.locator('.relations-link').count(), 0);
    assert(await graph.getByRole('button', { name: 'Añadir relación' }).isDisabled());
    assert(await graph.getByText('Aún no hay personajes.', { exact: false }).isVisible());
    await page.locator('#characters-back').click();
    assert(await page.locator('#project-overview').isVisible());
    assert.equal(await page.evaluate(() => document.body.classList.contains('is-characters')), false);
    assert.deepEqual(errors, []);
    console.log('OK: árbol, avatares, vínculos únicos por tipo, edición recíproca, arrastre guardado, zoom, exportación y móvil.');
  } finally {
    await browser.close();
  }
})().catch(reason => { console.error(reason); process.exitCode = 1; });
