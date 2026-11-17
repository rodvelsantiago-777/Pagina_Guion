const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const S = require('../screenplay.js');
const Archive = require('../project-archive.js');
const Details = require('../character-details.js');
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
const payload = { version: 1, screenplay: script, annotations: [], corrections: [], crew: {}, characterProfiles: withDetails };
const packed = Archive.stringify({ name: 'La visita', documentName: 'La visita.plano', payload });
assert.deepEqual(Archive.parse(packed).payload.characterProfiles, withDetails);
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
    const dialog = page.getByRole('dialog', { name: 'Ficha de personaje' });
    assert.equal(await dialog.getByLabel('Nombre(s)', { exact: true }).inputValue(), 'ÁNGELA');
    await dialog.getByLabel('Nombre(s)', { exact: true }).fill('Ángela');
    await dialog.getByLabel('Apellido(s)').fill('Gómez');
    await dialog.getByLabel('Edad').fill('21');
    await dialog.getByLabel('Sexo').selectOption('Femenino');
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
    await dialog.getByLabel('Nuevo apodo').fill('Canelita');
    await dialog.getByRole('button', { name: 'Añadir apodo' }).click();
    assert.deepEqual(await dialog.locator('.character-tag').allTextContents(), ['Ángela Gómez', 'Ángela', 'Canelita×']);
    await dialog.getByLabel('Apodo principal', { exact: true }).selectOption('Canelita');
    const addField = dialog.getByRole('button', { name: 'Añadir campo', exact: false }).first();
    const fieldPicker = dialog.getByLabel('Campo de información adicional', { exact: true });
    async function addDetail(key) {
      await addField.click();
      await fieldPicker.selectOption(key);
    }
    await addField.click();
    assert.equal(await fieldPicker.locator('optgroup').count(), 0);
    assert.equal(await fieldPicker.locator(':scope > option').count(), 33);
    const fieldOrder = await fieldPicker.locator('option').evaluateAll(options => options.map(option => option.value));
    assert.deepEqual(fieldOrder.slice(fieldOrder.indexOf('want'), fieldOrder.indexOf('want') + 4), ['want', 'need', 'internalGoal', 'externalGoal']);
    assert.equal(fieldOrder[fieldOrder.indexOf('height') + 1], 'weight');
    await fieldPicker.selectOption('relationships');
    await dialog.getByRole('button', { name: 'Añadir relación' }).click();
    const relationTarget = dialog.getByLabel('Personaje', { exact: true });
    assert.equal(await relationTarget.locator('option').filter({ hasText: 'ÁNGELA' }).count(), 0);
    await relationTarget.selectOption({ label: 'DOROTEA' });
    await dialog.getByLabel('Tipo de vínculo', { exact: true }).fill('Amiga de la infancia');
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
      'Arco de personaje', '¿Qué quiere?', '¿Qué necesita?', 'Relaciones', 'Orientación sexual', 'Tipo de personalidad (MBTI)',
    ]);
    assert.equal(await dialog.locator('#character-extra-fields :is(h3, h4, fieldset)').count(), 0);
    await dialog.getByRole('button', { name: 'Quitar campo ¿Qué necesita?', exact: true }).click();
    assert(await dialog.getByLabel('¿Qué necesita?', { exact: true }).isHidden());
    await page.screenshot({ path: path.join(out, 'ficha-personaje.png') });
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    await dialog.waitFor({ state: 'hidden' });
    const angelaCard = cards.getByRole('button', { name: /Ángela Gómez/ });
    await angelaCard.waitFor();
    assert.match(await angelaCard.textContent(), /Protagonista.*2 menciones · 1 diálogo/);
    const linked = await page.evaluate(() => state.characterProfiles);
    const savedAngela = linked.find(item => item.givenNames === 'Ángela');
    const savedDorotea = linked.find(item => item.givenNames === 'DOROTEA');
    assert.deepEqual(savedAngela.details, {
      relationships: [{ targetId: savedDorotea.id, type: 'Amiga de la infancia' }],
      arc: 'Redención', orientation: 'Fluida', personalityType: 'INFP-T', want: 'Encontrar la carta.',
    });
    assert.deepEqual(await page.evaluate(() => state.screenplay), original);
    await page.screenshot({ path: path.join(out, 'personajes-proyecto.png') });
    await cards.getByRole('button', { name: /DOROTEA/ }).click();
    await dialog.getByLabel('Nombre(s)', { exact: true }).fill('Dorotea');
    await dialog.getByLabel('Apellido(s)', { exact: true }).fill('Acosta');
    await dialog.getByRole('button', { name: 'Guardar personaje' }).click();
    await cards.getByRole('button', { name: /Dorotea Acosta/ }).waitFor();
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
    assert.equal(await dialog.getByLabel('Apellido(s)').inputValue(), 'Gómez');
    assert.equal(await dialog.getByLabel('Edad').inputValue(), '21');
    assert.equal(await dialog.getByLabel('Sexo').inputValue(), 'Femenino');
    assert.equal(await dialog.getByLabel('Rol en la historia').inputValue(), 'Protagonista');
    assert.equal(await aboutField.inputValue(), about);
    assert.equal(await aboutCount.textContent(), about.length + ' de 300 caracteres');
    assert.equal(await dialog.getByLabel('Apodo principal', { exact: true }).inputValue(), 'Canelita');
    assert.equal(await dialog.getByLabel('Especifica · Orientación sexual', { exact: true }).inputValue(), 'Fluida');
    assert.equal(await dialog.getByLabel('¿Qué quiere?', { exact: true }).inputValue(), 'Encontrar la carta.');
    assert.equal(await dialog.getByLabel('Personaje', { exact: true }).inputValue(), savedDorotea.id);
    assert.equal(await dialog.getByLabel('Personaje', { exact: true }).locator('option:checked').textContent(), 'Dorotea Acosta');
    assert.equal(await dialog.getByLabel('Tipo de vínculo', { exact: true }).inputValue(), 'Amiga de la infancia');
    await page.setViewportSize({ width: 390, height: 700 });
    assert(await dialog.evaluate(node => {
      const body = node.querySelector('.character-dialog-body');
      const footer = node.querySelector('footer').getBoundingClientRect();
      return body.scrollHeight > body.clientHeight && body.scrollWidth === body.clientWidth && footer.bottom <= innerHeight;
    }));
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.evaluate(() => createNativeScript(PlanoScreenplay.create('Otro proyecto')));
    await page.locator('#editor-home').click();
    await page.locator('.script-card-open').click();
    await page.locator('#open-project-characters').click();
    await cards.getByText('Aún no hay personajes.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Nuevo personaje' }).click();
    const create = page.getByRole('dialog', { name: 'Nuevo personaje' });
    await create.getByLabel('Nombre(s)', { exact: true }).fill('Lucía');
    await create.getByLabel('Apellido(s)').fill('Ríos');
    await create.getByLabel('Nuevo apodo').fill('Luci');
    await create.getByRole('button', { name: 'Añadir apodo' }).click();
    await create.getByLabel('Nuevo apodo').fill('Lu');
    await create.getByRole('button', { name: 'Añadir apodo' }).click();
    await create.getByLabel('Apodo principal', { exact: true }).selectOption('Luci');
    await create.getByRole('button', { name: 'Guardar personaje' }).click();
    await cards.getByRole('button', { name: /Lucía/ }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(state.key)).characterProfiles);
    assert.deepEqual(saved.map(item => [item.givenNames, item.primaryAlias]), [['Lucía', 'Luci']]);
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
    assert.deepEqual(errors, []);
    console.log('OK: fichas, apodos, diálogos, 32 campos opcionales, relaciones estables al renombrar, móvil y copia .plano.');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
