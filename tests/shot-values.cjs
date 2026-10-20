/* Ficha de plano: tarjetas, campos personalizados, producción y persistencia. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const output=path.join(__dirname,'.output'); fs.mkdirSync(output,{recursive:true});
async function ready(page) {
  await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer') && document.querySelector('#render-status').hidden && document.querySelector('.script-workspace').getAttribute('aria-busy')!=='true');
}
async function notes(page) {return page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('plano-notes-v1:')))).annotations);}
async function beginLine(page) {
  await page.locator('button[data-tool="line"]').click(); const r=await page.locator('.page-window').first().boundingBox();
  await page.mouse.move(r.x+r.width*.85,r.y+50); await page.mouse.down(); await page.mouse.move(r.x+r.width*.85,r.y+115,{steps:8}); await page.mouse.up();
  await page.locator('#shot-name-dialog').waitFor({state:'visible'});
}
async function finishLine(page) {
  await page.locator('#shot-name-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#shot-name-dialog').open && !document.querySelector('.pending-annotation'));
  await page.locator('button[data-tool="select"]').click();
}
async function edit(page,index=0) {await page.locator('.edit-annotation').nth(index).click(); await page.locator('#edit-shot-dialog').waitFor({state:'visible'});}
async function save(page) {await page.locator('#edit-shot-form button[type="submit"]').click(); await page.waitForFunction(()=>!document.querySelector('#edit-shot-dialog').open);}
async function importNotes(page,data) {await page.locator('#backup-input').setInputFiles({name:'fichas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
(async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
  for(const [heading,body] of [['INT. CASA - DIA','Ana abre la puerta.'],['EXT. CALLE - NOCHE','Ana camina por la calle.']]) {
    const sheet=pdf.addPage([595,842]); sheet.drawText(heading,{x:65,y:770,size:12,font}); sheet.drawText(body,{x:65,y:730,size:12,font});
  }
  const buffer=Buffer.from(await pdf.save()),browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    assert.deepEqual(await page.locator('#shot-value-input option').evaluateAll(options=>options.map(option=>option.value)),['','GPG','PG','PE','PA','PM','PMC','PP','PPP','PD','P de 2','P de 3','P Conjunto']);
    for(const value of ['moderate-wide','wide','ultra-wide','macro']) assert.equal(await page.locator(`#shot-lens-input option[value="${value}"]`).count(),1);
    await page.locator('#file-input').setInputFiles({name:'fichas.pdf',mimeType:'application/pdf',buffer}); await ready(page);
    await page.locator('#scene-select').selectOption('scene-1', {force:true}); await ready(page);
    await beginLine(page); await page.locator('#shot-value-input').selectOption('PM');
    const custom={angle:'Picada oblicua',lens:'Óptica experimental',movement:'Órbita con ascenso'};
    for(const field of Object.keys(custom)) {
      await page.locator(`#shot-${field}-input`).selectOption('other');
      assert(await page.locator(`#shot-${field}-input-other`).isVisible());
      await page.locator(`#shot-${field}-input-other`).fill('   ');
    }
    await page.locator('#shot-name-form button[type="submit"]').click();
    assert(await page.locator('#shot-name-dialog').isVisible()); assert.equal(await page.locator('#annotation-count').textContent(),'0','Otro vacío no crea una marca');
    for(const [field,value] of Object.entries(custom)) await page.locator(`#shot-${field}-input-other`).fill(value);
    const description='Ana entra despacio y descubre la habitación vacía. '.repeat(7)+'🎬 Final sin recortar.\nSegunda línea de la descripción.';
    const production={description,grip:'Dolly sobre raíles.\nDos metros de recorrido.',sound:'Ambiente de la casa y pasos de Ana.',note:'Revisar continuidad de la puerta.\nRodar también un plano de seguridad.'};
    await page.locator('#shot-name-form .shot-writing-section summary').click();
    for(const [key,id] of [['description','description'],['grip','grip'],['sound','sound'],['note','notes']]) await page.locator(`#shot-${id}-input`).fill(production[key]);
    await finishLine(page); const original=(await notes(page))[0];
    assert.equal(original.shotName,'1'); assert.equal(original.shotValue,'PM');
    for(const key of Object.keys(production)) assert.equal(original[key],production[key],'Conserva el texto escrito al crear');
    for(const [field,key] of [['angle','shotAngle'],['lens','shotLens'],['movement','shotMovement']]) {assert.equal(original[key],'other');assert.equal(original[key+'Other'],custom[field]);}
    const card=page.locator('.annotation-card').first();
    assert.equal(await card.locator('select,input,textarea').count(),0,'Tarjeta de lectura sin controles de formulario');
    assert.equal(await card.locator('.annotation-specs').textContent(),'PMPicada oblicuaÓptica experimental');
    const preview=await card.locator('.annotation-description').textContent(); assert.equal(Array.from(preview).length,160); assert(preview.endsWith('…'));
    assert.equal(await card.locator('.annotation-has-notes').count(),1);
    assert.equal(await page.locator('.document-shot-tag').textContent(),'1','Solo el nombre en el documento');
    const sizes=await card.evaluate(el=>[...['.annotation-jump','.annotation-description','.annotation-specs'].map(selector=>parseFloat(getComputedStyle(el.querySelector(selector)).fontSize))]);
    assert(sizes[0]>sizes[1]&&sizes[1]>sizes[2],'Jerarquía de título, descripción y datos pequeños');
    await page.screenshot({path:path.join(output,'tarjetas-plano.png'),fullPage:true});
    await card.locator('.annotation-description').click(); await page.locator('#shot-details-dialog').waitFor({state:'visible'});
    assert(!(await page.locator('#edit-shot-dialog').isVisible()));
    for(const key of Object.keys(production)) assert.equal(await page.locator(`#shot-details-${key}`).textContent(),production[key]);
    assert((await page.locator('#shot-details-technical').textContent()).includes(custom.movement));
    await page.screenshot({path:path.join(output,'ficha-plano-completa.png'),fullPage:true});
    await page.keyboard.press('Escape'); assert(!(await page.locator('#shot-details-dialog').isVisible()));
    await card.locator('.annotation-jump').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#shot-details-dialog').isVisible(),'El teclado y el título abren la ficha');
    await page.locator('#edit-shot-details').click(); await page.locator('#edit-shot-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#edit-shot-info').inputValue(),production.note);
    await page.locator('#edit-shot-angle-other').fill('   '); await page.locator('#edit-shot-form button[type="submit"]').click();
    assert(await page.locator('#edit-shot-dialog').isVisible(),'Especificar Otro también es obligatorio al editar');
    assert.deepEqual((await notes(page))[0],original,'Un formulario inválido no modifica los datos');
    await page.locator('#edit-shot-angle').selectOption('high');
    assert(!(await page.locator('#edit-shot-angle-other').isVisible()));
    assert(await page.locator('#edit-shot-angle-other').isDisabled(),'No bloquea guardar al cambiar de Otra a una opción conocida');
    await page.locator('#edit-shot-lens').selectOption('moderate-wide'); await page.locator('#edit-shot-movement').selectOption('none');
    await page.locator('#edit-shot-info').fill(''); await save(page);
    const edited=(await notes(page))[0]; assert.equal(edited.shotAngleOther,''); assert.equal(edited.shotLensOther,''); assert.equal(edited.shotMovementOther,'');
    assert.equal(await card.locator('.annotation-has-notes').count(),0,'El icono desaparece cuando no hay notas');
    assert.equal(edited.description,description); assert.deepEqual(edited.start,original.start); assert.deepEqual(edited.end,original.end);
    await page.locator('#undo-button').click(); assert.deepEqual((await notes(page))[0],original); assert.equal(await card.locator('.annotation-has-notes').count(),1);
    await page.locator('#redo-button').click(); assert.deepEqual((await notes(page))[0],edited);
    await edit(page); await page.locator('#edit-shot-description').fill('Cambio que se descarta'); await page.keyboard.press('Escape'); assert.equal((await notes(page))[0].description,description);
    await card.locator('.locate-annotation').click(); assert(!(await page.locator('#shot-details-dialog').isVisible()),'Localizar no abre la ficha');
    await beginLine(page); assert.equal(await page.locator('#shot-name-input').getAttribute('placeholder'),'2');
    assert.equal(await page.locator('#shot-angle-input').inputValue(),''); assert(await page.locator('#shot-angle-input-other').isDisabled());
    await finishLine(page); assert.equal((await notes(page))[1].shotName,'2');
    const downloading=page.waitForEvent('download'); await page.locator('#project-menu summary').click(); await page.locator('#save-backup').click();
    const backupPath=path.join(output,'fichas-plano.json'); await (await downloading).saveAs(backupPath); const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.equal(backup.annotations[0].description,description); assert.equal(backup.annotations[0].grip,production.grip);
    await page.reload(); await page.locator('#file-input').setInputFiles({name:'fichas.pdf',mimeType:'application/pdf',buffer}); await ready(page);
    assert.deepEqual((await notes(page))[0],edited,'Recupera todos los datos tras cerrar');
    const legacy={...edited,id:'legacy',shotId:'legacy',shotName:'Antiguo',shotAngle:'other',note:'Nota antigua'};
    for(const key of ['description','grip','sound','shotAngleOther','shotLensOther','shotMovementOther']) delete legacy[key];
    const grouped=[{...original,id:'group-1',shotId:'group',shotName:'Grupo'},{...original,id:'group-2',shotId:'group',shotName:'Grupo',page:2}];
    await importNotes(page,{...backup,annotations:[legacy,...grouped]}); await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='5');
    assert.equal((await notes(page)).find(item=>item.id==='legacy').note,'Nota antigua','Compatibilidad sin perder notas anteriores');
    await page.locator('.annotation-card[data-id="legacy"] .edit-annotation').click(); assert(await page.locator('#edit-shot-angle-other').isVisible());
    await page.locator('#edit-shot-form button[type="submit"]').click(); assert(await page.locator('#edit-shot-dialog').isVisible()); await page.locator('#cancel-edit-shot').click();
    await page.locator('.annotation-card[data-id="group-1"] .edit-annotation').click();
    await page.locator('#edit-shot-grip').fill('Trípode'); await page.locator('#edit-shot-info').fill('Nota compartida'); await save(page);
    assert((await notes(page)).filter(item=>item.shotId==='group').every(item=>item.grip==='Trípode'&&item.note==='Nota compartida'),'Todas las partes del plano se actualizan juntas');
    for(const [key,value,message] of [['shotLens','valor inválido','datos de óptica inválidos'],['shotAngleOther',{},'especificaciones de Otro inválidas'],['description','x'.repeat(4001),'datos de descripción inválidos']]) {
      await importNotes(page,{...backup,annotations:[{...original,id:'invalid',[key]:value}]});
      await page.waitForFunction(message=>document.querySelector('#feedback').textContent.includes(message),message);
      assert.equal((await notes(page)).length,5);
    }
    await page.setViewportSize({width:390,height:900}); await page.locator('#fit-width').click(); await ready(page);
    await page.locator('#toggle-annotations').click(); await page.locator('.annotation-card').first().scrollIntoViewIfNeeded();
    assert(await page.locator('#annotations-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:path.join(output,'tarjetas-plano-movil.png'),fullPage:true});
    await page.locator('.annotation-description').first().click();
    assert(await page.locator('#shot-details-dialog').evaluate(el=>el.getBoundingClientRect().width<innerWidth&&el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:path.join(output,'ficha-plano-movil.png'),fullPage:true});
    await page.locator('#edit-shot-details').click();
    assert(await page.locator('#edit-shot-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.locator('#cancel-edit-shot').click();
    await page.setViewportSize({width:1540,height:1100}); await page.locator('#fit-width').click(); await ready(page);
    await page.locator('#scene-select').selectOption('scene-1', {force:true}); await ready(page);
    await page.locator('.textLayer').first().waitFor(); await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('.textLayer'));getSelection().removeAllRanges();getSelection().addRange(range);});
    await page.locator('#apply-highlight').click(); await page.locator('#shot-name-dialog').waitFor({state:'visible'}); await page.locator('#shot-name-input').fill('Resalte');
    await page.locator('#shot-name-form .shot-writing-section summary').click(); await page.locator('#shot-notes-input').fill('Notas del resalte'); await finishLine(page);
    assert.equal((await notes(page)).find(item=>item.type==='highlight').note,'Notas del resalte');
    await page.locator('.annotation-card').filter({has:page.locator('.annotation-jump').filter({hasText:'Resalte'})}).locator('.annotation-description').click();
    assert(await page.locator('#shot-details-excerpt').isVisible());
    await page.locator('#close-shot-details').click(); assert.deepEqual(errors,[]);
    console.log('OK: tarjetas resumidas, ficha completa y teclado, Otro obligatorio, grip/sonido/descripción/notas, iconos, cancelación, historial, JSON/local, grupos, compatibilidad, líneas/resaltes y móvil.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
