/* Selección por plano lógico, paleta real, historial y recuperación. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const fields={color:'#476bab',shotValue:'PMC',shotAngle:'normal',shotLens:'macro',description:'La cámara acompaña al personaje.',grip:'Trípode',sound:'Ambiente',note:'Mantener continuidad.'};
const notes=[
 {...fields,id:'line',shotId:'long',shotName:'P1',type:'line',page:1,endPage:2,start:{x:.83,y:.2},end:{x:.83,y:.4}},
 {...fields,color:'#e8b83f',id:'h1',shotId:'highlight',shotName:'P2',type:'highlight',page:1,rects:[{x:.15,y:.32,width:.25,height:.02}],text:'Primera parte'},
 {...fields,color:'#e8b83f',id:'h2',shotId:'highlight',shotName:'P2',type:'highlight',page:2,rects:[{x:.15,y:.32,width:.25,height:.02}],text:'Segunda parte'},
 {...fields,id:'other',shotId:'other',shotName:'P3',type:'line',page:2,start:{x:.93,y:.5},end:{x:.93,y:.6}}
];
const checkbox=(page,id)=>page.locator(`.annotation-card[data-id=${id}] .shot-select`);
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
async function apply(page,color){await page.locator('#batch-color-launch').click();await page.locator(`#preset-colors [data-color="${color}"]`).click();await ready(page);}
async function importNotes(page,fingerprint){await page.locator('#backup-input').setInputFiles({name:'planos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:notes}))});await page.waitForFunction(()=>state.annotations.length===4);await ready(page);}
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(let n=1;n<=2;n++){const sheet=pdf.addPage([595,842]);sheet.drawText(`INT. ESTUDIO ${n} - DIA`,{x:65,y:770,size:12,font});sheet.drawText('Ana prepara la camara para el plano.',{x:65,y:670,size:12,font});}
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#file-input').setInputFiles({name:'Colores.pdf',mimeType:'application/pdf',buffer});await ready(page);
  assert(await page.locator('#select-all-shots').isDisabled());const fingerprint=await page.evaluate(()=>state.fingerprint);await importNotes(page,fingerprint);
  const before=await page.evaluate(()=>structuredClone(state.annotations)),history=await page.evaluate(()=>state.history.length);
  await checkbox(page,'h1').check();assert(await checkbox(page,'h2').isChecked());assert.equal(await page.locator('#shot-selection-count').textContent(),'1 seleccionado');assert(!(await page.locator('#shot-details-dialog').isVisible()));
  await checkbox(page,'line').check();assert.equal(await page.locator('#shot-selection-count').textContent(),'2 seleccionados');assert(await page.locator('#select-all-shots').evaluate(el=>el.indeterminate));assert(await page.locator('#batch-color-launch').evaluate(el=>el.classList.contains('is-mixed')));
  await page.locator('#batch-color-launch').click();const palette=await page.locator('#color-picker-dialog').boundingBox();assert(palette.width<350);await page.screenshot({path:path.join(out,'colores-multiples.png')});await page.locator('#preset-colors [data-color="#64a7d9"]').click();await ready(page);
  const after=await page.evaluate(()=>structuredClone(state.annotations));assert.equal(await page.evaluate(()=>state.history.length),history+1);
  for(const item of after){const original=before.find(note=>note.id===item.id);assert.deepEqual(item,{...original,color:item.id==='other'?original.color:'#64a7d9'});}
  assert.equal(await page.locator('.annotation-card.is-batch-selected').count(),3);assert(!(await page.locator('#batch-color-launch').evaluate(el=>el.classList.contains('is-mixed'))));
  assert(await page.locator('.annotation-card[data-id=line]').evaluate(el=>el.style.getPropertyValue('--annotation-color')==='#64a7d9'));
  await apply(page,'#64a7d9');assert.equal(await page.evaluate(()=>state.history.length),history+1,'El mismo color no añade historial');
  await page.locator('#undo-button').click();await ready(page);assert.deepEqual(await page.evaluate(()=>state.annotations),before);await page.locator('#redo-button').click();await ready(page);assert.deepEqual(await page.evaluate(()=>state.annotations),after);
  // La casilla superior incluye planos de grupos plegados y cuenta planos, no tramos.
  await page.locator('.annotation-scene-group').last().evaluate(el=>el.open=false);await page.locator('#select-all-shots').check();assert.equal(await page.locator('#shot-selection-count').textContent(),'3 seleccionados');
  await page.locator('#batch-color-launch').click();await page.locator('#choose-custom-color').click();await page.locator('#custom-color-hex').fill('#D24669');await page.locator('#save-custom-color').click();await ready(page);assert(await page.evaluate(()=>state.annotations.every(item=>item.color==='#d24669')));
  const persisted=await page.evaluate(()=>state.annotations);await page.locator('#clear-shot-selection').click();assert(!(await page.locator('#shot-selection-actions').isVisible()));assert(!(await page.locator('#select-all-shots').isChecked()));assert.equal(await page.locator('.annotation-card.is-batch-selected').count(),0);
  // Teclado y ficha conservan sus funciones independientes.
  await checkbox(page,'line').focus();await page.keyboard.press('Space');assert(await checkbox(page,'line').isChecked());
  await page.locator('.annotation-card[data-id=line] .annotation-jump').click();await page.locator('#shot-details-dialog').waitFor({state:'visible'});await page.keyboard.press('Escape');
  await page.locator('.annotation-card[data-id=line] .delete-annotation').click();assert.equal(await page.evaluate(()=>state.selectedShots.size),0);assert(!(await page.locator('#shot-selection-actions').isVisible()));await page.locator('#undo-button').click();await ready(page);
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Colores.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.deepEqual(await page.evaluate(()=>state.annotations),persisted);assert.equal(await page.evaluate(()=>state.selectedShots.size),0);
  await checkbox(page,'line').check();await page.locator('.annotation-card[data-id=line] .annotation-jump').click();await page.locator('#copy-shot-details').click();await page.keyboard.press('Control+v');await page.locator('#paste-as-highlight').click();
  assert(await page.locator('#annotations-panel').evaluate(el=>el.inert));const count=await page.evaluate(()=>state.history.length);await page.evaluate(()=>colorSelectedShots('#ffffff'));assert.equal(await page.evaluate(()=>state.history.length),count);await page.keyboard.press('Escape');assert(!(await page.locator('#annotations-panel').evaluate(el=>el.inert)));
  // Otro documento, incluso con IDs de plano iguales, no hereda la selección.
  const otherPdf=await PDFDocument.create();otherPdf.addPage([595,842]);await page.locator('#file-input').setInputFiles({name:'Otro.pdf',mimeType:'application/pdf',buffer:Buffer.from(await otherPdf.save())});await page.waitForFunction(()=>state.file?.name==='Otro.pdf'&&!state.busy);assert.equal(await page.evaluate(()=>state.selectedShots.size),0);assert(await page.locator('#select-all-shots').isDisabled());
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));
  await touch.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await touch.locator('#file-input').setInputFiles({name:'Colores.pdf',mimeType:'application/pdf',buffer});await ready(touch);await importNotes(touch,fingerprint);if(await touch.locator('#annotations-panel').isHidden())await touch.locator('#toggle-annotations').click();
  await checkbox(touch,'line').check();await checkbox(touch,'h1').check();await apply(touch,'#8d77cc');assert.equal(await touch.evaluate(()=>state.annotations.filter(item=>item.color==='#8d77cc').length),3);
  assert(await touch.locator('#annotations-panel').evaluate(el=>el.scrollWidth<=el.clientWidth));assert((await touch.locator('.annotation-card').first().boundingBox()).height<150);await touch.screenshot({path:path.join(out,'colores-multiples-movil.png')});await mobile.close();assert.deepEqual(errors,[]);
  console.log('OK: selección de planos completos, grupos plegados, colores mixtos, paleta compacta y personalizada, propiedades intactas, un paso de historial, no-op, teclado, ficha, borrado, persistencia, exclusión del pegado, documentos y móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
