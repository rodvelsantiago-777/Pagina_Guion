/* Etapas, tabla completa y editor visual de color sin salir del proyecto. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
async function stage(page,value){await page.locator(`#stage-tabs [data-stage="${value}"]`).click();if(value==='technical')await page.locator('#technical-view').waitFor({state:'visible'});else await ready(page);}
async function notes(page){return page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('plano-notes-v1:')))).annotations);}
(async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
  for(const [index,text] of ['Ana abre la puerta.','La calle permanece vacia.'].entries()){
    const page=pdf.addPage([595,842]);if(index===0)page.drawText('INT. CASA - DIA',{x:65,y:770,size:12,font});page.drawText(text,{x:65,y:700,size:12,font});if(index===1)page.drawText('EXT. CALLE - NOCHE',{x:65,y:400,size:12,font});
  }
  const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const base=process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;await page.goto(base);
    assert(!(await page.locator('#stage-tabs').isVisible()),'La portada no muestra etapas sin documento');
    await page.locator('#file-input').setInputFiles({name:'guion-tecnico.pdf',mimeType:'application/pdf',buffer});await ready(page);
    assert.equal(await page.locator('#stage-tabs button').count(),3);assert(await page.locator('#stage-tabs [data-stage="writing"]').isDisabled());
    assert.equal(await page.locator('#stage-tabs [data-stage="coverage"]').getAttribute('aria-selected'),'true');await stage(page,'technical');
    assert(await page.locator('#technical-empty').isVisible());assert(!(await page.locator('#document-view').isVisible()));assert(!(await page.locator('#toggle-annotations').isVisible()));
    await page.locator('#back-to-coverage').click();await ready(page);
    const description='Un plano sostenido que acompaña a Ana al abrir la puerta. '.repeat(9)+'\nSin cortar la descripción en la tabla.';
    const common={color:'#64a7d9',shotValue:'PM',shotAngle:'other',shotAngleOther:'Picada oblicua',shotLens:'moderate-wide',shotMovement:'dolly-in',description,grip:'Dolly sobre raíles.\nDos metros de recorrido.',sound:'Pasos y ambiente interior.',note:'Mantener continuidad de la mano.\nComprobar el foco.',createdAt:'2026-10-20T00:00:00Z'};
    const records=[{...common,id:'line',shotId:'line',shotName:'1B',shotOrder:1,type:'line',page:1,start:{x:.8,y:.15},end:{x:.8,y:.30}},{...common,id:'highlight-1',shotId:'highlight',shotName:'1A',shotOrder:0,type:'highlight',page:1,text:'Ana abre la puerta.',rects:[{x:.11,y:.15,width:.3,height:.02}]},{...common,id:'highlight-2',shotId:'highlight',shotName:'1A',shotOrder:0,type:'highlight',page:2,text:'La calle permanece vacia.',rects:[{x:.11,y:.15,width:.3,height:.02}]},{...common,id:'scene-2',shotId:'scene-2',shotName:'2A',shotOrder:0,type:'line',page:2,start:{x:.8,y:.6},end:{x:.8,y:.7}}];
    const fingerprint=await page.evaluate(()=>state.fingerprint);await page.locator('#backup-input').setInputFiles({name:'fichas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:records}))});await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='4');
    const viewer=await page.evaluate(()=>state.viewer.id);await stage(page,'technical');
    assert.deepEqual(await page.locator('#technical-table thead th').allTextContents(),['Plano','Valor','Angulación','Óptica','Movimiento','Descripción','Grip','Sonido','Notas']);assert.equal(await page.locator('#technical-table-body tr[data-shot-id]').count(),3,'Una fila por plano, sin duplicar sus partes entre páginas');
    assert.deepEqual(await page.locator('.technical-shot-name').allTextContents(),['1A','1B','2A']);assert.equal(await page.locator('.technical-scene-row').count(),2);
    const first=page.locator('#technical-table-body tr[data-shot-id="highlight"]');
    assert.deepEqual(await first.locator('td').allTextContents(),['PM','Picada oblicua','Angular (moderado)','Dolly in',description,common.grip,common.sound,common.note]);
    assert((await first.boundingBox()).height>90,'La fila crece para mostrar el texto completo');
    assert(await first.locator('[data-field="description"] .technical-cell-value').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'La descripción no se recorta');
    const cell=field=>first.locator(`[data-field="${field}"]`);
    await cell('description').locator('.technical-cell-value').click();assert.equal(await cell('description').locator('textarea').inputValue(),description,'La celda permite editar el texto completo aunque la fila sea compacta');
    await cell('description').locator('textarea').fill('Cambio que se cancela');await page.keyboard.press('Escape');assert.equal((await notes(page))[1].description,description);
    await page.screenshot({path:path.join(output,'guion-tecnico-tabla.png'),fullPage:true});
    await first.locator('.technical-open-details').click();await page.locator('#edit-shot-details').click();await page.locator('#edit-shot-description').fill('Descripción actualizada desde el guion técnico.');await page.locator('#edit-shot-info').fill('Nueva nota');
    await page.locator('#edit-color-launch').click();assert(!(await page.locator('#recent-color-section').isVisible()));
    assert.equal((await page.locator('#choose-custom-color').textContent()).trim(),'');assert.equal(await page.locator('#choose-custom-color svg').count(),1);
    await page.locator('#choose-custom-color').click();assert(await page.locator('#recent-color-section').isVisible());
    await page.locator('#custom-color-hex').fill('#FF0000');const spectrum=page.locator('#color-spectrum'),box=await spectrum.boundingBox();
    await page.mouse.click(box.x+box.width/3,box.y+1);const rgb=await Promise.all(['red','green','blue'].map(id=>page.locator('#custom-color-'+id).inputValue()));
    assert(Number(rgb[1])>245&&Number(rgb[0])<10&&Number(rgb[2])<10,'El selector visual produce verde en la zona correspondiente');
    await page.locator('#color-brightness').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#custom-color-hex').inputValue(),'#000000');await page.keyboard.press('End');assert.notEqual(await page.locator('#custom-color-hex').inputValue(),'#000000');
    await spectrum.focus();const before=await spectrum.getAttribute('aria-valuenow');await page.keyboard.press('ArrowRight');assert.notEqual(await spectrum.getAttribute('aria-valuenow'),before,'El espectro se controla con teclado');
    for(const [id,value] of [['red','64'],['green','128'],['blue','192']])await page.locator('#custom-color-'+id).fill(value);
    assert.equal(await page.locator('#custom-color-hex').inputValue(),'#4080C0');assert.equal(await page.locator('#custom-color-preview').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(64, 128, 192)');
    await page.screenshot({path:path.join(output,'editor-color-visual.png'),fullPage:true});await page.locator('#save-custom-color').click();assert(await page.locator('#edit-shot-dialog').isVisible());await page.locator('#edit-shot-form button[type="submit"]').click();
    assert.equal(await page.locator('#stage-tabs [data-stage="technical"]').getAttribute('aria-selected'),'true');assert.equal(await first.locator('td').nth(4).textContent(),'Descripción actualizada desde el guion técnico.');
    assert((await notes(page)).filter(item=>item.shotId==='highlight').every(item=>item.note==='Nueva nota'&&item.color==='#4080c0'));
    assert.equal(await page.evaluate(()=>state.viewer.id),viewer,'Editar la tabla no intenta renderizar un PDF oculto');
    await page.locator('#technical-undo').click();assert.equal(await first.locator('td').nth(4).textContent(),description);await page.locator('#technical-redo').click();assert.equal(await first.locator('td').nth(7).textContent(),'Nueva nota');
    const beforeInline=await notes(page),geometry=items=>items.map(({id,start,end,rects,page,color,shotId,shotOrder})=>({id,start,end,rects,page,color,shotId,shotOrder}));
    await cell('shotName').locator('.technical-cell-value').click();await cell('shotName').locator('input').fill('   ');await page.keyboard.press('Enter');
    assert(await cell('shotName').locator('input').isVisible());assert.equal((await notes(page))[1].shotName,'1A','No guarda un nombre vacío');
    await page.locator('#stage-tabs [data-stage="coverage"]').click();assert.equal(await page.locator('#stage-tabs [data-stage="technical"]').getAttribute('aria-selected'),'true','La edición inválida permanece abierta hasta corregir o cancelar');await page.keyboard.press('Escape');
    await cell('shotName').locator('.technical-cell-value').click();await cell('shotName').locator('input').fill('1AX');await page.keyboard.press('Tab');
    assert((await notes(page)).filter(item=>item.shotId==='highlight').every(item=>item.shotName==='1AX'));assert(await cell('shotValue').locator('button').evaluate(el=>el===document.activeElement),'Tab guarda y avanza a la siguiente celda');
    await cell('shotValue').locator('.technical-cell-value').click();await cell('shotValue').locator('select').selectOption('PP');assert.equal(await cell('shotValue').locator('.technical-cell-value').textContent(),'PP');
    await cell('shotAngle').locator('.technical-cell-value').click();await cell('shotAngle').locator('select').selectOption('normal');
    assert((await notes(page)).filter(item=>item.shotId==='highlight').every(item=>item.shotAngle==='normal'&&item.shotAngleOther===''));
    await cell('shotAngle').locator('.technical-cell-value').click();await cell('shotAngle').locator('select').selectOption('other');await cell('shotAngle').locator('.technical-other-input').fill('   ');await page.keyboard.press('Enter');
    assert.equal((await notes(page))[1].shotAngle,'normal','Otro no se guarda hasta especificar cuál');
    await cell('shotAngle').locator('.technical-other-input').fill('Ángulo a ras de mesa');await cell('shotLens').locator('.technical-cell-value').click();
    assert(await cell('shotLens').locator('select').isVisible(),'Se puede pasar a otra celda con un solo clic sin perderlo al guardar la anterior');
    assert((await notes(page)).filter(item=>item.shotId==='highlight').every(item=>item.shotAngle==='other'&&item.shotAngleOther==='Ángulo a ras de mesa'));
    await cell('shotLens').locator('select').selectOption('telephoto');await cell('shotMovement').locator('.technical-cell-value').click();await cell('shotMovement').locator('select').selectOption('none');
    await cell('description').locator('.technical-cell-value').click();await cell('description').locator('textarea').fill('Descripción en dos líneas.');await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('Segundo párrafo.');
    assert(await cell('description').locator('textarea').isVisible(),'Enter en el texto introduce un salto de línea');await page.keyboard.press('Control+Enter');
    assert.equal((await notes(page))[1].description,'Descripción en dos líneas.\nSegundo párrafo.');
    const longSound='Sonido directo: diálogo, respiración y ambiente de la habitación. '.repeat(18)+'\nMantener la pista completa sin cortes.';
    await cell('sound').locator('.technical-cell-value').click();await cell('sound').locator('textarea').fill(longSound);assert(await cell('sound').locator('textarea').evaluate(el=>el.scrollHeight<=el.clientHeight+2),'El campo crece mientras se escribe');await page.keyboard.press('Control+Enter');
    assert.equal(await cell('sound').locator('.technical-cell-value').textContent(),longSound);assert(await cell('sound').locator('.technical-cell-value').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Todo el sonido es visible');assert((await first.boundingBox()).height>200);await page.screenshot({path:path.join(output,'guion-tecnico-texto-completo.png'),fullPage:true});
    await page.locator('#technical-undo').click();await cell('grip').locator('.technical-cell-value').click();await cell('grip').locator('textarea').fill('Trípode\nCabeza fluida');await page.keyboard.press('Control+Enter');
    await cell('sound').locator('.technical-cell-value').click();await cell('sound').locator('textarea').fill('Sonido directo');await cell('note').locator('.technical-cell-value').click();assert(await cell('note').locator('textarea').isVisible());
    await cell('note').locator('textarea').fill('Nota editada en tabla 🎬');await page.screenshot({path:path.join(output,'guion-tecnico-editando.png'),fullPage:true});await page.keyboard.press('Control+Enter');
    const editedGroup=(await notes(page)).filter(item=>item.shotId==='highlight');
    assert(editedGroup.every(item=>item.grip==='Trípode\nCabeza fluida'&&item.sound==='Sonido directo'&&item.note==='Nota editada en tabla 🎬'&&item.shotValue==='PP'&&item.shotLens==='telephoto'&&item.shotMovement==='none'));
    assert.deepEqual(geometry(await notes(page)),geometry(beforeInline),'Las ediciones conservan geometría, color, páginas y orden');
    await page.locator('#technical-undo').click();assert.equal(await cell('note').locator('.technical-cell-value').textContent(),'Nueva nota');await page.locator('#technical-redo').click();assert.equal(await cell('note').locator('.technical-cell-value').textContent(),'Nota editada en tabla 🎬');
    assert((await first.boundingBox()).height<100,'La fila se compacta cuando los textos son cortos');
    await first.locator('.technical-open-details').click();await page.locator('#locate-shot-details').click();await ready(page);assert.equal(await page.locator('#stage-tabs [data-stage="coverage"]').getAttribute('aria-selected'),'true');assert(await page.locator('#document-view').isVisible());
    await page.locator('#scene-select').selectOption('scene-1', {force:true});await ready(page);const handle=page.locator('.annotation-card[data-id="line"] .shot-reorder-handle');await handle.focus();await page.keyboard.press('Alt+ArrowUp');await stage(page,'technical');assert.deepEqual(await page.locator('.technical-shot-name').allTextContents(),['1B','1AX','2A'],'La tabla sigue el orden de cobertura');
    const finalNotes=await notes(page);await page.reload();await page.locator('#file-input').setInputFiles({name:'guion-tecnico.pdf',mimeType:'application/pdf',buffer});await ready(page);await stage(page,'technical');assert.deepEqual(await notes(page),finalNotes,'Las ediciones directas se recuperan al volver a abrir el guion');
    await stage(page,'coverage');await page.locator('[data-color-target="annotation-color"]').click();assert(!(await page.locator('#recent-color-section').isVisible()));await page.locator('#choose-custom-color').click();assert.equal(await page.locator('#recent-colors button').first().getAttribute('data-color'),'#4080c0');await page.locator('#cancel-color-picker').click();
    await page.setViewportSize({width:390,height:900});await page.locator('#fit-width').click();await ready(page);assert(await page.locator('#stage-tabs').isVisible());
    await stage(page,'technical');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.locator('.technical-table-scroll').evaluate(el=>el.scrollWidth>el.clientWidth),'La tabla se desplaza dentro de su contenedor');
    await page.screenshot({path:path.join(output,'guion-tecnico-movil.png'),fullPage:true});await stage(page,'coverage');await page.locator('[data-color-target="annotation-color"]').click();await page.locator('#choose-custom-color').click();
    assert(await page.locator('#color-picker-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(output,'editor-color-visual-movil.png'),fullPage:true});await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);console.log('OK: tres botones de etapa, escritura bloqueada, tabla compacta de nueve columnas, edición directa de todos los campos, Otro obligatorio, cancelar/Tab/Ctrl+Enter, grupos, historial, persistencia, colores y móvil.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
