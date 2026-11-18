const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js');
const Archive = require('../project-archive.js');
const Details = require('../character-details.js');
const Avatar = require('../character-avatar.js');
const { chromium } = require('./runtime-deps.cjs').load('playwright');
const { launch } = require('./editor-auth-fixture.cjs');

const about = 'Sabe escuchar y suele hacer preguntas incómodas.\nOculta lo que sabe de la visita.';
const paragraph = (id, kind, text) => ({ type: 'paragraph', attrs: { id, kind }, content: [{ type: 'text', text }] });
const script = S.create('La visita');
script.characters = ['PERSONAJE BORRADO'];
script.doc.content = [
  paragraph('scene', 'scene', 'INT. CASA - DÍA'),
  paragraph('action', 'action', 'Dorotea mira a ÁNGELA y le dice.'),
  paragraph('dorotea', 'character', 'DOROTEA'),
  paragraph('aside', 'parenthetical', '(preocupada)'),
  paragraph('question', 'dialogue', '¿Qué te pasa, Canelita?'),
  paragraph('angela', 'character', 'ÁNGELA'),
  paragraph('answer', 'dialogue', 'No sé.'),
  paragraph('plural', 'action', 'Hay varias canelitas.'),
  paragraph('extra', 'character', 'VECINA'),
];

const [angela] = S.validateProfiles([{
  id: 'angela-ficha', givenNames: 'Ángela', surnames: 'Gómez', age: '21', sex: 'Femenino',
  role: 'Protagonista', aliases: ['Canelita', 'canelita', 'Ángela', 'Dra. Alba'], primaryAlias: 'canelita', about,
}]);
assert.equal(angela.gender, 'Mujer');
assert.equal(angela.sex, undefined);
const legacyProfile = { ...angela };
delete legacyProfile.gender;
assert.equal(S.validateProfiles([{ ...legacyProfile, sex: 'Masculino' }])[0].gender, 'Hombre');
const [intersex] = S.validateProfiles([{ ...legacyProfile, sex: 'Intersexual' }]);
assert.equal(intersex.gender, '');
assert.equal(intersex.sex, 'Intersexual');
assert.deepEqual(S.validateProfiles([{ ...intersex, gender: 'No binario' }]), [{ ...intersex, gender: 'No binario' }]);
assert.throws(() => S.validateProfiles([{ ...angela, gender: 'Intersexual' }]), /género válido/);
assert.deepEqual(S.characterForms(angela), ['Ángela Gómez', 'Ángela', 'Canelita', 'Dra. Alba']);
assert.deepEqual(S.analyze(script).characters.map(item => item.name), ['DOROTEA', 'ÁNGELA', 'VECINA']);
const analysis = S.analyze(script, [angela]);
assert.equal(analysis.characters.filter(item => /ángela|canelita/i.test(item.name)).length, 1);
const profile = analysis.characters[0];
assert.deepEqual(profile.mentions.map(row => row.id), ['action', 'question']);
assert.deepEqual(profile.mentions.map(row => row.text.slice(row.ranges[0].from, row.ranges[0].to)), ['ÁNGELA', 'Canelita']);
assert.equal(profile.dialogues[0].text, 'No sé.');
const alternativeCue = structuredClone(script);
alternativeCue.doc.content.find(node => node.attrs.id === 'angela').content[0].text = 'CANELITA';
const aliasSpeaker = S.analyze(alternativeCue, [angela]).characters;
assert.equal(aliasSpeaker[0].dialogues[0].text, 'No sé.');
assert(!aliasSpeaker.some(item => item.name === 'CANELITA'));
assert.deepEqual(S.characterMatcher(['Dra. Alba'])('Llega la dra. Alba.').map(row => row.name), ['Dra. Alba']);
assert.deepEqual(S.characterMatcher(['Dra. Alba'])('Llega la Dra Alba.'), []);
assert(S.characterRoster(script, undefined, [angela]).includes('CANELITA'));
const twin = { ...angela, id: 'angela-rios', surnames: 'Ríos', aliases: [], primaryAlias: undefined };
assert.deepEqual(S.analyze(script, [angela, twin], { includeUnusedProfiles: true }).characters.slice(0, 2).map(item => item.mentions.map(row => row.id)), [['question'], []]);
assert(!S.analyze(script, [angela, twin]).characters.some(item => item.profile?.id === twin.id));
assert.equal(S.characterSpeaker(twin), 'ÁNGELA RÍOS');
assert.equal(S.characterSpeaker(angela), 'CANELITA');
assert.deepEqual(S.characterSpeakers(['CANELITA', 'ÁNGELA', 'DOROTEA'], [angela]).map(({ value }) => value), ['CANELITA', 'DOROTEA']);
assert.throws(() => S.validateProfiles([{ ...angela, primaryAlias: 'Otro' }]), /uno de los apodos/);
assert.throws(() => S.validateProfiles([angela, { ...twin, aliases: ['Canelita'] }]), /otro personaje/);
assert.throws(() => S.validateProfiles([{ ...angela, about: 'a'.repeat(S.characterAboutLimit + 1) }]), /hasta 300 caracteres/);
assert.equal(S.validateProfiles([{ ...angela, about: ' ' + about.replace('\n', '\r\n') + ' ' }])[0].about, about);
assert.equal(S.validateProfiles([{ ...angela, about: undefined }])[0].about, undefined);
assert.equal(Details.fields.size, 32);
const personalityTypes = Details.fields.get('personalityType');
assert.equal(new Set(personalityTypes.optionGroups[0].options).size, 16);
assert(personalityTypes.options.includes('INFP-A') && personalityTypes.options.includes('INFP-T'));
const expanded = { ...angela, details: {
  orientation: 'Otra etiqueta personal', arc: 'Redención', height: '1,72 m',
  birthplace: '', personalityType: 'INFP', relationships: [{ targetId: twin.id, type: 'Hermana' }],
} };
assert.throws(() => S.validateProfiles([expanded]), /otro personaje de este proyecto/);
assert.throws(() => S.validateProfiles([{ ...expanded, details: { ...expanded.details, personalityType: 'NNNN' } }, twin]), /opción válida/);
assert.throws(() => S.validateProfiles([{ ...expanded, details: { relationships: [{ targetId: angela.id, type: 'Rival' }] } }]), /otro personaje de este proyecto/);
const withDetails = S.validateProfiles([expanded, twin]);
const legacyReverse = Details.relationshipsFor(withDetails, twin.id);
assert.deepEqual(legacyReverse, [{ targetId: angela.id, type: 'Hermana', sourceId: angela.id }]);
const keptLegacy = S.validateProfiles(Details.updateRelationships(withDetails, { ...twin, details: { relationships: legacyReverse } }));
assert.deepEqual(keptLegacy, withDetails, 'Guardar desde la otra ficha conserva una sola descripción antigua');
const categorized = S.validateProfiles(Details.updateRelationships(withDetails, { ...twin, details: { relationships: [{ ...legacyReverse[0], type: 'Familia' }] } }));
assert.deepEqual(categorized[0].details.relationships, [{ targetId: twin.id, type: 'Familia' }]);
assert.equal(categorized[1].details, undefined, 'Cambiar el tipo desde la otra ficha mantiene un solo registro');
const legacyDuplicates = [withDetails[0], { ...twin, details: { relationships: [{ targetId: angela.id, type: 'Hermana' }] } }];
assert.equal(Details.relationshipsFor(legacyDuplicates, twin.id).length, 1);
assert.throws(() => Details.updateRelationships(withDetails, { ...twin, details: { relationships: [...legacyReverse, ...legacyReverse] } }), /ya está añadida/);
const payload = { version: 1, screenplay: script, annotations: [], corrections: [], crew: {}, characterProfiles: withDetails };
const packed = Archive.stringify({ name: 'La visita', documentName: 'La visita.plano', payload });
assert.deepEqual(Archive.parse(packed).payload.characterProfiles, withDetails);
const savedAvatar = { v: 3, orejas: 'puntiagudas', formaOjos: 'abiertos', vestuario: 'caballero', piel: '#79A988', ropa: '#414954' };
const avatarPayload = { ...payload, characterProfiles: [{ ...withDetails[0], avatar: { ...Avatar.normalize(savedAvatar), extra: '<svg/>' } }, twin] };
const avatarArchive = Archive.stringify({ name: 'La visita', documentName: 'La visita.plano', payload: avatarPayload });
assert.deepEqual(Archive.parse(avatarArchive).payload.characterProfiles[0].avatar, savedAvatar);
assert.equal(S.validateProfiles([{ ...angela, avatar: 'data:image/svg+xml,abc' }])[0].avatar, undefined);
assert(!S.portable(script).includes('characterProfiles'));

const out = path.join(__dirname, '.output');
fs.mkdirSync(out, { recursive: true });

async function run() {
  const browser = await launch(chromium, process.env.PLANO_BROWSER === 'brave'
    ? { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true }
    : { channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.context().route('**/*', route => /^https?:/.test(route.request().url()) ? route.abort() : route.continue());
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await page.evaluate(value => createNativeScript(value), script);
    const original = await page.evaluate(() => state.screenplay);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    const cards = page.locator('#character-list');
    await cards.getByRole('button', { name: /ÁNGELA/ }).click();
    const fromScript = page.getByRole('dialog', { name: 'ÁNGELA', exact: true });
    assert.equal(await fromScript.getByRole('textbox').count(), 0);
    assert.equal(await fromScript.getByRole('heading', { name: 'Información adicional' }).count(), 0);
    await fromScript.getByRole('button', { name: 'Editar personaje' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar personaje' });
    assert.equal(await dialog.getByLabel('Nombre(s)', { exact: true }).inputValue(), 'ÁNGELA');
    await dialog.getByLabel('Nombre(s)', { exact: true }).fill('Ángela');
    await dialog.getByLabel('Apellido(s)').fill('Gómez');
    await dialog.getByLabel('Edad', { exact: true }).fill('21');
    const gender = dialog.getByLabel('Género', { exact: true });
    assert.deepEqual(await gender.locator('option').allTextContents(), ['Sin definir', 'Mujer', 'Hombre', 'No binario', 'Género fluido', 'Agénero', 'Otro género']);
    await gender.selectOption('Mujer');
    await dialog.getByLabel('Rol en la historia').selectOption('Protagonista');
    const aboutField = dialog.getByLabel('Acerca de', { exact: true });
    const aboutCount = dialog.locator('#character-about-count');
    assert.equal(await aboutField.inputValue(), '');
    assert.equal(await aboutCount.textContent(), '0 de 300 caracteres');
    await aboutField.focus();
    await page.keyboard.insertText('a'.repeat(S.characterAboutLimit + 25));
    assert.equal((await aboutField.inputValue()).length, S.characterAboutLimit);
    assert.equal(await aboutCount.textContent(), '300 de 300 caracteres');
    await aboutField.fill(about);
    const addAlias = dialog.getByRole('button', { name: 'Añadir apodo', exact: true });
    const aliasInput = dialog.getByRole('textbox', { name: 'Nuevo apodo', exact: true });
    assert(await aliasInput.isHidden());
    await addAlias.click();
    assert(await aliasInput.evaluate(input => input === document.activeElement && input.closest('.character-tag')));
    await aliasInput.fill('Canelita');
    await aliasInput.press('Enter');
    assert(await aliasInput.isHidden());
    assert.deepEqual(await dialog.locator('.character-tag-list .character-tag').allTextContents(), ['Ángela Gómez', 'Ángela', 'Canelita×']);
    await addAlias.click();
    await aliasInput.fill('???');
    await aliasInput.press('Enter');
    assert(await dialog.getByText('Escribe un apodo válido.').isVisible());
    await aliasInput.press('Escape');
    assert(await dialog.isVisible());
    assert(await aliasInput.isHidden());
    await dialog.getByLabel('Apodo principal', { exact: true }).selectOption('Canelita');
    const addField = dialog.getByRole('button', { name: 'Añadir campo', exact: true });
    const fieldPicker = dialog.getByRole('list', { name: 'Campos disponibles' });
    const fieldTag = key => fieldPicker.getByRole('button', { name: 'Añadir ' + Details.fields.get(key).label, exact: true });
    async function addDetail(key) {
      await fieldTag(key).click();
    }
    assert.equal(await addField.getAttribute('aria-expanded'), 'false');
    await addField.press('Enter');
    assert.equal(await addField.getAttribute('aria-expanded'), 'true');
    const choices = [...Details.fields.values()].map(field => 'Añadir ' + field.label);
    assert.deepEqual(await fieldPicker.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))), choices);
    assert(await fieldPicker.evaluate(picker => {
      const panel = picker.getBoundingClientRect(), body = picker.closest('.character-dialog-body').getBoundingClientRect();
      return panel.top >= body.top - 1 && panel.bottom <= body.bottom + 1;
    }), 'En escritorio se ven todas las etiquetas al desplegarlas');
    await page.screenshot({ path: path.join(out, 'campos-personaje-etiquetas.png') });
    await fieldTag('relationships').press('Space');
    assert(await fieldPicker.isVisible());
    assert.equal(await fieldTag('relationships').count(), 0);
    await dialog.getByRole('button', { name: 'Añadir relación' }).click();
    const relationTarget = dialog.getByLabel('Personaje', { exact: true });
    assert.equal(await relationTarget.locator('option').filter({ hasText: 'ÁNGELA' }).count(), 0);
    await relationTarget.selectOption({ label: 'DOROTEA' });
    const relationType = dialog.getByLabel('Tipo de vínculo', { exact: true });
    assert.deepEqual(await relationType.locator('option').allTextContents(), ['Elegir vínculo', ...Details.relationshipTypes]);
    await relationType.selectOption('Amistad');
    await addDetail('startStatus');
    await dialog.getByLabel('Estado al inicio de la historia', { exact: true }).selectOption('Vivo');
    await addDetail('arc');
    await dialog.getByLabel('Arco de personaje', { exact: true }).selectOption('Redención');
    await addDetail('orientation');
    await dialog.getByLabel('Orientación sexual', { exact: true }).selectOption({ label: 'Otra orientación…' });
    await dialog.getByLabel('Especifica · Orientación sexual', { exact: true }).fill('Fluida');
    await addDetail('personalityType');
    await dialog.getByLabel('Tipo de personalidad (MBTI)', { exact: true }).selectOption('INFP-T');
    await addDetail('want');
    await dialog.getByLabel('¿Qué quiere?', { exact: true }).fill('Encontrar la carta.');
    await addDetail('need');
    const fieldLabels = dialog.locator('#character-extra-fields > .character-extra-field > .character-extra-field-heading > :is(label, strong)');
    assert.deepEqual(await fieldLabels.allTextContents(), [
      'Estado al inicio de la historia', 'Arco de personaje', '¿Qué quiere?', '¿Qué necesita?', 'Relaciones', 'Orientación sexual', 'Tipo de personalidad (MBTI)',
    ]);
    assert.equal(await dialog.locator('#character-extra-fields :is(h3, h4, fieldset)').count(), 0);
    await dialog.getByRole('button', { name: 'Quitar campo ¿Qué necesita?', exact: true }).click();
    assert(await dialog.getByLabel('¿Qué necesita?', { exact: true }).isHidden());
    assert(await fieldTag('need').isVisible());
    await addDetail('height');
    assert(await fieldPicker.isVisible());
    async function checkFieldColumns() {
      const layout = await dialog.locator('#character-extra-fields').evaluate(grid => {
        const control = key => grid.querySelector('#character-detail-' + key);
        const box = key => control(key).closest('.character-extra-field').getBoundingClientRect();
        const beside = (a, b) => Math.abs(a.top - b.top) < 1 && a.right < b.left && Math.abs(a.width - b.width) < 1;
        return {
          shortFieldsShareRows: beside(box('startStatus'), box('arc')) && beside(box('orientation'), box('personalityType')),
          selectsAlign: beside(control('startStatus').getBoundingClientRect(), control('arc').getBoundingClientRect()),
          selectsKeepHeight: control('orientation').offsetHeight === control('personalityType').offsetHeight,
          longFieldsUseBothColumns: ['want', 'relationships'].every(key => Math.abs(box(key).width - grid.clientWidth) < 1),
        };
      });
      assert.deepEqual(layout, { shortFieldsShareRows: true, selectsAlign: true, selectsKeepHeight: true, longFieldsUseBothColumns: true });
    }
    await checkFieldColumns();
    const editIcon = dialog.getByRole('button', { name: 'Editar icono del personaje' });
    const creator = page.getByRole('dialog', { name: 'Creador de personaje' });
    const menu = key => creator.locator(`[data-avatar-menu="${key}"]`);
    async function expand(key) {
      const target = menu(key);
      if (await target.getAttribute('open') === null) await target.locator('summary').click();
      assert.equal(await creator.locator('details[open]').count(), 1);
      await target.locator('.character-avatar-thumbnail svg').first().waitFor();
      return target;
    }
    async function choose(key, name) {
      const target = await expand(key);
      const radio = page.getByRole('radio', { name, exact: true });
      await target.locator('label.character-avatar-choice').filter({ has: radio }).click();
      assert(await target.getByRole('radio', { name, exact: true }).isChecked());
    }
    const swatches = selector => selector.locator('[data-avatar-swatch]').evaluateAll(buttons => buttons.map(button => button.dataset.hex));
    await editIcon.click();
    await creator.waitFor();
    assert(await dialog.isHidden());
    await menu('cejas').locator('summary').press('Enter');
    assert.equal(await menu('pelo').getAttribute('open'), null);
    await choose('cejas', 'Sin cejas');
    assert.equal(await creator.locator('[data-avatar-preview] [data-brows]').count(), 0);
    await choose('cejas', 'Con cejas');
    await choose('orejas', 'Puntiagudas (elfo)');
    await choose('formaOjos', 'Más abiertos');
    assert.deepEqual(await swatches(menu('formaOjos')), await swatches(menu('pelo')));
    await choose('vestuario', 'Caballero con armadura');
    const metal = menu('vestuario').locator('[data-avatar-color="ropa"]');
    const armorPalette = await swatches(metal);
    await metal.getByRole('button', { name: 'Usar color #414954' }).click();
    await choose('vestuario', 'Policía');
    assert.notDeepEqual(await swatches(metal), armorPalette);
    await choose('vestuario', 'Caballero con armadura');
    assert.equal(await metal.getByRole('button', { name: 'Usar color #414954' }).getAttribute('aria-pressed'), 'true');
    await expand('piel');
    await creator.getByRole('button', { name: 'Color de piel personalizado' }).click();
    assert(await creator.locator('#color-picker-dialog').isVisible());
    assert(await page.locator('#custom-color-hex').isVisible());
    assert(await page.locator('#color-picker-dialog .palette-primary').isHidden());
    await page.locator('#custom-color-hex').fill('#79a988');
    await page.locator('#save-custom-color').click();
    assert.equal(await creator.locator('[data-avatar-preview] [data-ears="puntiagudas"]').count(), 3);
    await expand('vestuario');
    await page.screenshot({ path: path.join(out, 'creador-personaje.png') });
    await creator.getByRole('button', { name: 'Guardar icono' }).click();
    await dialog.waitFor();
    assert(await creator.isHidden());
    assert.equal(await aboutField.inputValue(), about);
    assert.equal(await dialog.getByLabel('Apodo principal', { exact: true }).inputValue(), 'Canelita');
    assert.equal(await dialog.getByLabel('¿Qué quiere?', { exact: true }).inputValue(), 'Encontrar la carta.');
    assert.equal(await editIcon.locator('[data-ears="puntiagudas"]').count(), 1);
    assert(await editIcon.evaluate(button => button === document.activeElement));
    assert(await page.evaluate(() => !state.characterProfiles.some(profile => profile.avatar)));
    await editIcon.click();
    await expand('vestuario');
    assert(await menu('vestuario').getByRole('radio', { name: 'Caballero con armadura' }).isChecked());
    await choose('vestuario', 'Cocinero');
    assert(await menu('vestuario').getByText('Uniforme y gorro blancos').isVisible());
    assert(await menu('vestuario').locator('[data-outfit-colors]').isHidden());
    await page.keyboard.press('Escape');
    await dialog.waitFor();
    assert.equal(await editIcon.locator('[data-headwear]').count(), 1);
    assert.equal(await editIcon.locator('[data-headwear] circle').count(), 2);
    await dialog.locator('#character-extra-fields').evaluate(grid => grid.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(out, 'editar-personaje.png') });
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const ficha = page.getByRole('dialog', { name: 'Ángela Gómez' });
    const basics = ficha.getByRole('region', { name: 'Datos básicos' });
    const extra = ficha.getByRole('region', { name: 'Información adicional' });
    assert.equal(await ficha.getByRole('textbox').count(), 0);
    assert.equal(await ficha.locator('[data-profile-initials] [data-ears="puntiagudas"]').count(), 1);
    assert.deepEqual(await basics.locator('dt').allTextContents(), ['Edad', 'Género', 'Acerca de']);
    assert.deepEqual(await basics.locator('dd').allTextContents(), ['21', 'Mujer', about]);
    assert.deepEqual(await ficha.getByRole('list', { name: 'Apodos', exact: true }).getByRole('listitem').allTextContents(), ['Canelita Principal']);
    assert.equal(await ficha.locator('[data-profile-role]').textContent(), 'Protagonista');
    assert(await ficha.evaluate(node => {
      const bounds = selector => node.querySelector(selector).getBoundingClientRect();
      return node.clientWidth > 760 && bounds('.character-profile-side').right < bounds('h2').left &&
        bounds('[data-profile-role]').top > bounds('[data-profile-initials]').bottom &&
        bounds('.character-profile-alias-line').top > bounds('h2').bottom &&
        bounds('footer').top >= bounds('.character-profile-scroll').bottom &&
        node.querySelector('footer').contains(node.querySelector('[data-profile-edit]')) &&
        node.querySelector('footer').contains(node.querySelector('[data-profile-close]'));
    }));
    assert.deepEqual(await extra.locator('dt').allTextContents(), ['Estado al inicio de la historia', 'Arco de personaje', '¿Qué quiere?', 'Relaciones', 'Orientación sexual', 'Tipo de personalidad (MBTI)', 'Altura']);
    assert.equal(await extra.locator('dl > div').filter({ hasText: 'Altura' }).locator('dd').textContent(), '—');
    assert.match(await extra.textContent(), /DOROTEA · Amistad/);
    await page.screenshot({ path: path.join(out, 'ficha-personaje.png') });
    await ficha.getByRole('button', { name: 'Cerrar ficha' }).click();
    const angelaCard = cards.getByRole('button', { name: /Ángela Gómez/ });
    await page.waitForFunction(() => document.activeElement?.matches('.character-card') && document.activeElement.textContent.includes('Ángela Gómez'));
    assert.match(await angelaCard.textContent(), /Protagonista.*2 menciones · 1 diálogo/);
    assert.equal(await angelaCard.locator('.character-initials [data-ears="puntiagudas"]').count(), 1);
    const linked = await page.evaluate(() => state.characterProfiles);
    const savedAngela = linked.find(item => item.givenNames === 'Ángela');
    const savedDorotea = linked.find(item => item.givenNames === 'DOROTEA');
    assert.deepEqual(savedAngela.avatar, savedAvatar);
    assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem(state.key)).characterProfiles.find(profile => profile.id === id).avatar, savedAngela.id), savedAvatar);
    assert.deepEqual(savedAngela.details, {
      relationships: [{ targetId: savedDorotea.id, type: 'Amistad' }],
      startStatus: 'Vivo', arc: 'Redención', orientation: 'Fluida', personalityType: 'INFP-T', want: 'Encontrar la carta.', height: '',
    });
    assert.deepEqual(await page.evaluate(() => state.screenplay), original);
    await page.screenshot({ path: path.join(out, 'personajes-proyecto.png') });
    await cards.getByRole('button', { name: /DOROTEA/ }).click();
    const reciprocal = page.getByRole('dialog', { name: 'DOROTEA', exact: true });
    await reciprocal.getByText('Ángela Gómez · Amistad', { exact: true }).waitFor();
    await reciprocal.getByRole('button', { name: 'Editar personaje' }).click();
    await dialog.getByLabel('Nombre(s)', { exact: true }).fill('Dorotea');
    await dialog.getByLabel('Apellido(s)', { exact: true }).fill('Acosta');
    assert.equal(await relationType.inputValue(), 'Amistad');
    await relationType.selectOption('Familia');
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    const doroteaProfile = page.getByRole('dialog', { name: 'Dorotea Acosta' });
    const doroteaCard = cards.getByRole('button', { name: /Dorotea Acosta/ });
    await doroteaProfile.getByText('Ángela Gómez · Familia', { exact: true }).waitFor();
    await doroteaProfile.getByRole('button', { name: 'Cerrar ficha' }).click();
    await doroteaCard.waitFor();
    await page.locator('#characters-back').click();
    await page.locator('[data-project-stage=writing]').click();
    await page.locator('#writer-characters-tab').click();
    const detail = page.locator('.writer-character').filter({ has: page.locator('summary', { hasText: 'Ángela Gómez' }) });
    await detail.locator('summary').click();
    assert.equal(await detail.getByRole('button', { name: /mira a ÁNGELA/ }).count(), 1);
    await detail.getByRole('button', { name: /Qué te pasa, Canelita/ }).click();
    assert.equal(await page.evaluate(() => {
      const { doc, selection } = PlanoWriter.view().state;
      return doc.textBetween(selection.from, selection.to);
    }), 'Canelita');
    assert.equal(await page.locator('.writer-character').filter({ has: page.locator('summary', { hasText: 'Canelita' }) }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Gestionar fichas' }).count(), 0);
    assert(await page.locator('#project-characters').isHidden());
    await page.evaluate(() => {
      const view = PlanoWriter.view(), end = view.state.doc.content.size;
      const tr = view.state.tr.insert(end, view.state.schema.nodes.paragraph.create({ kind: 'character', id: 'new-cue' }));
      view.dispatch(tr.setSelection(PlanoProseMirror.TextSelection.create(tr.doc, end + 1)));
      view.focus();
    });
    await page.keyboard.insertText('Áng');
    const suggestion = page.locator('#writer-suggestions').getByRole('option', { name: 'CANELITA', exact: true });
    await suggestion.click();
    assert.equal(await page.evaluate(() => PlanoWriter.view().state.selection.$from.parent.textContent), 'CANELITA');
    assert.equal(await page.evaluate(() => PlanoWriter.view().state.doc.child(5).textContent), 'ÁNGELA', 'Las líneas existentes conservan su nombre');
    await page.evaluate(() => {
      const view = PlanoWriter.view();
      view.state.doc.forEach((node, position) => {
        if (node.attrs.id === 'dorotea') {
          view.dispatch(view.state.tr.setSelection(PlanoProseMirror.TextSelection.create(view.state.doc, position + 1)));
        }
      });
    });
    await page.getByLabel('Personajes del proyecto', { exact: true }).selectOption({ label: 'Canelita · Ángela Gómez' });
    await page.locator('.writer-cast-picker').getByRole('button', { name: 'Insertar' }).click();
    assert.deepEqual(await page.evaluate(() => {
      const { doc } = PlanoWriter.view().state;
      return doc.content.content.slice(2, 8).map(node => [node.attrs.kind, node.textContent]);
    }), [['character', 'DOROTEA'], ['parenthetical', 'preocupada'], ['dialogue', '¿Qué te pasa, Canelita?'], ['character', 'CANELITA'], ['dialogue', ''], ['character', 'ÁNGELA']]);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await angelaCard.click();
    assert.match(await extra.textContent(), /Dorotea Acosta · Familia/);
    assert.equal(await page.evaluate(() => state.characterProfiles.flatMap(profile => profile.details?.relationships || []).length), 1);
    await ficha.getByRole('button', { name: 'Editar personaje' }).click();
    assert.equal(await dialog.getByLabel('Apellido(s)').inputValue(), 'Gómez');
    assert.equal(await dialog.getByLabel('Edad', { exact: true }).inputValue(), '21');
    assert.equal(await gender.inputValue(), 'Mujer');
    assert.equal(await dialog.getByLabel('Rol en la historia').inputValue(), 'Protagonista');
    assert.equal(await aboutField.inputValue(), about);
    assert.equal(await aboutCount.textContent(), about.length + ' de 300 caracteres');
    assert.equal(await dialog.getByLabel('Apodo principal', { exact: true }).inputValue(), 'Canelita');
    assert.equal(await dialog.getByLabel('Especifica · Orientación sexual', { exact: true }).inputValue(), 'Fluida');
    assert.equal(await dialog.getByLabel('¿Qué quiere?', { exact: true }).inputValue(), 'Encontrar la carta.');
    assert.equal(await dialog.getByLabel('Personaje', { exact: true }).inputValue(), savedDorotea.id);
    assert.equal(await dialog.getByLabel('Personaje', { exact: true }).locator('option:checked').textContent(), 'Dorotea Acosta');
    assert.equal(await relationType.inputValue(), 'Familia');
    await page.setViewportSize({ width: 390, height: 700 });
    await editIcon.click();
    await creator.waitFor();
    await expand('formaOjos');
    assert(await menu('formaOjos').getByRole('radio', { name: 'Más abiertos' }).isChecked());
    assert(await creator.evaluate(node => {
      const panel = node.querySelector('.character-avatar-settings');
      const footer = node.querySelector('footer').getBoundingClientRect();
      return panel.scrollHeight > panel.clientHeight && panel.scrollWidth === panel.clientWidth && footer.bottom <= innerHeight;
    }));
    await page.screenshot({ path: path.join(out, 'creador-personaje-movil.png') });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'dark' }));
    await choose('vestuario', 'Leñador');
    assert.equal(await menu('vestuario').locator('[data-outfit-colors] fieldset:visible').count(), 3);
    await creator.getByRole('button', { name: 'Cuadros · color principal personalizado', exact: true }).click();
    assert(await page.locator('#custom-color-hex').isVisible());
    await page.keyboard.press('Escape');
    assert(await creator.isVisible());
    await page.screenshot({ path: path.join(out, 'creador-personaje-menus-oscuro.png') });
    await creator.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await dialog.waitFor();
    await page.evaluate(() => PlanoAppearance.choose({ mode: 'light' }));
    await page.setViewportSize({ width: 390, height: 700 });
    await checkFieldColumns();
    assert(await dialog.evaluate(node => {
      const body = node.querySelector('.character-dialog-body');
      const footer = node.querySelector('footer').getBoundingClientRect();
      return body.scrollHeight > body.clientHeight && body.scrollWidth === body.clientWidth && footer.bottom <= innerHeight;
    }));
    await addField.click();
    assert(await fieldPicker.evaluate(picker => picker.scrollWidth === picker.clientWidth));
    await addField.click();
    assert.equal(await addField.getAttribute('aria-expanded'), 'false');
    await dialog.getByLabel('Edad', { exact: true }).fill('99');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(await basics.getByText('21', { exact: true }).count(), 1);
    assert(await ficha.evaluate(node => {
      const viewport = node.querySelector('.character-profile-scroll');
      const footer = node.querySelector('footer').getBoundingClientRect();
      const close = node.querySelector('[data-profile-close]').getBoundingClientRect();
      const report = node.querySelector('#report-launch')?.getBoundingClientRect();
      return node.scrollWidth === node.clientWidth && viewport.scrollWidth === viewport.clientWidth &&
        footer.top >= viewport.getBoundingClientRect().bottom && footer.bottom <= innerHeight &&
        (!report || close.right <= report.left);
    }));
    await page.screenshot({ path: path.join(out, 'ficha-personaje-movil.png') });
    await ficha.getByRole('button', { name: 'Editar personaje' }).click();
    assert.equal(await dialog.getByLabel('Edad', { exact: true }).inputValue(), '21');
    await page.keyboard.press('Escape');
    await ficha.waitFor();
    await page.keyboard.press('Escape');
    await ficha.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await doroteaCard.click();
    await doroteaProfile.getByRole('button', { name: 'Editar personaje' }).click();
    await dialog.getByRole('button', { name: 'Quitar relación 1' }).click();
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    await doroteaProfile.getByRole('button', { name: 'Cerrar ficha' }).click();
    await angelaCard.click();
    assert.equal(await ficha.getByText('Dorotea Acosta · Familia', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => state.characterProfiles.flatMap(profile => profile.details?.relationships || []).length), 0);
    await ficha.getByRole('button', { name: 'Cerrar ficha' }).click();

    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Otro proyecto')));
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await cards.getByText('Aún no hay personajes.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    const create = page.getByRole('dialog', { name: 'Nuevo personaje' });
    await create.getByLabel('Nombre(s)', { exact: true }).fill('Lucía');
    await create.getByLabel('Apellido(s)').fill('Ríos');
    await create.getByLabel('Género', { exact: true }).selectOption('No binario');
    await create.getByRole('button', { name: 'Añadir apodo' }).click();
    await create.getByLabel('Nuevo apodo').fill('Luci');
    await create.getByLabel('Apellido(s)', { exact: true }).click();
    assert(await create.getByRole('button', { name: 'Quitar apodo Luci', exact: true }).isVisible());
    await create.getByLabel('Apodo principal', { exact: true }).selectOption('Luci');
    await create.getByRole('button', { name: 'Añadir apodo' }).click();
    await create.getByLabel('Nuevo apodo').fill('Lu');
    await create.getByRole('button', { name: 'Guardar personaje' }).click();
    await cards.getByRole('button', { name: /Lucía/ }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles);
    assert.deepEqual(saved.map(item => [item.givenNames, item.primaryAlias, item.gender]), [['Lucía', 'Luci', 'No binario']]);
    assert.deepEqual(saved[0].aliases, ['Luci', 'Lu']);
    await page.locator('#characters-back').click();
    await page.locator('[data-project-stage=writing]').click();
    await page.locator('#writer-characters-tab').click();
    const cast = page.getByLabel('Personajes del proyecto', { exact: true });
    assert.equal(await page.locator('#writer-character-count').textContent(), '0');
    assert.equal(await page.locator('.writer-character').count(), 0);
    await cast.selectOption({ label: 'Luci · Lucía Ríos' });
    await page.locator('.writer-cast-picker').getByRole('button', { name: 'Insertar' }).click();
    assert.deepEqual(await page.evaluate(() => PlanoWriter.view().state.doc.content.content.map(node => [node.attrs.kind, node.textContent])), [['character', 'LUCI'], ['dialogue', '']]);
    assert.equal(await page.evaluate(() => PlanoWriter.view().state.selection.$from.parent.attrs.kind), 'dialogue');
    await page.keyboard.insertText('No esperaba verte.');
    const lucia = page.locator('.writer-character').filter({ hasText: 'Lucía Ríos' });
    await lucia.locator('summary').click();
    await lucia.getByRole('button', { name: /No esperaba verte\./ }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    const olderProject = JSON.parse(packed);
    olderProject.project.payload.characterProfiles = [{ ...legacyProfile, sex: 'Intersexual' }];
    olderProject.project.payload.proofreading = { enabled: false, dictionary: '', ignored: [] };
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#file-input').setInputFiles({ name: 'Anterior.plano', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(olderProject)) });
    await page.waitForFunction(() => state.screenplay?.title === 'La visita' && !state.busy);
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await angelaCard.click();
    const previousData = basics.getByText('Dato anterior · Intersexual', { exact: true });
    await previousData.waitFor();
    await ficha.getByRole('button', { name: 'Editar personaje' }).click();
    assert.equal(await gender.inputValue(), '');
    await gender.selectOption('Género fluido');
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    await previousData.waitFor();
    assert.deepEqual(await page.evaluate(() => state.characterProfiles.map(({ gender, sex }) => ({ gender, sex }))), [{ gender: 'Género fluido', sex: 'Intersexual' }]);
    assert.deepEqual(errors, []);
    console.log('OK: ficha, creador de iconos, borradores, persistencia, apodos, diálogos, relaciones y móvil.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
