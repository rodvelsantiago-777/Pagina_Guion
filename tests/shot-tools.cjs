/* Duración, texto vinculado, acciones de tabla y edición en una ventana separada. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib'),script=require('../shot-script.js');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
const line={id:'master',shotId:'master',shotName:'1A',type:'line',page:1,color:'#64a7d9',start:{x:.86,y:.08},end:{x:.86,y:.58}};
const long={...line,id:'long',shotId:'long',shotName:'1B',endPage:3,start:{x:.9,y:.5},end:{x:.9,y:.5}};
const highlight={id:'highlight',shotId:'highlight',shotName:'1C',type:'highlight',page:1,color:'#e8b83f',text:'Ana ajusta la camara.',rects:[{x:.11,y:.15,width:.3,height:.02}]};
async function selectRow(page){
 await page.evaluate(()=>{const context=[...state.viewer.contexts.values()].find(c=>c.segment.page===1&&c.status==='ready');const spans=[...context.content.querySelectorAll('.textLayer span')],first=spans.find(span=>span.textContent.includes('Todo'));if(!first)throw Error('No hay texto disponible');const y=first.getBoundingClientRect().y,row=spans.filter(span=>Math.abs(span.getBoundingClientRect().y-y)<2&&span.textContent.trim());const last=row.at(-1),range=document.createRange();range.setStart(first.firstChild,0);range.setEnd(last.firstChild,last.firstChild.length);getSelection().removeAllRanges();getSelection().addRange(range);context.content.querySelector('.textLayer').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0}));});
 await page.waitForFunction(()=>!document.querySelector('#apply-pasted-highlight').disabled);
}
(async()=>{
 assert.equal(script.duration([line],[]),30);assert.equal(script.duration([long],[]),120);
 assert.equal(script.duration([{...line,start:{x:.8,y:0},end:{x:.8,y:1}}],[]),60);
 assert.equal(script.duration([line,{...line,id:'same'}],[]),30,'No duplica tramos superpuestos');
 assert.equal(script.format(120),'2:00');assert.throws(()=>script.validateSelection([{page:9,text:'x',rects:[]}],3));
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Courier);
 for(let number=1;number<=3;number++){const page=doc.addPage([595,842]);page.drawText('INT. ESTUDIO '+number+' - DIA',{x:65,y:770,size:12,font});page.drawText('Ana ajusta la camara.',{x:65,y:700,size:12,font});page.drawText('Todo esta preparado para la toma.',{x:65,y:640,size:12,font});}
 const buffer=Buffer.from(await doc.save()),server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!target.startsWith(root+path.sep)||!fs.existsSync(target)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#file-input').setInputFiles({name:'Nuevas funciones.pdf',mimeType:'application/pdf',buffer});await ready(page);
  await page.evaluate(notes=>{state.annotations=validateNotes(notes);changed();},[line,long,highlight]);await ready(page);
  const label=page.locator('.document-shot-label[data-annotation-id=master]').first();assert.equal(await label.evaluate(el=>getComputedStyle(el).fontWeight),'700');assert((await label.evaluate(el=>getComputedStyle(el).fontFamily)).includes('Courier New'));
  // Color elegido en el formulario de creación, sin cambiar otros planos.
  await page.locator('[data-tool=line]').click();const box=await page.locator('.page-window').first().boundingBox();
  await page.mouse.move(box.x+box.width*.95,box.y+60);await page.mouse.down();await page.mouse.move(box.x+box.width*.95,box.y+160,{steps:6});await page.mouse.up();
  await page.locator('#shot-name-dialog').waitFor({state:'visible'});await page.locator('#new-color-launch').click();await page.locator('#preset-colors [data-color="#e77c6e"]').click();await page.locator('#shot-name-form button[type=submit]').click();await page.waitForFunction(()=>state.annotations.length===4);
  assert.equal(await page.evaluate(()=>state.annotations.at(-1).color),'#e77c6e');assert.equal(await page.evaluate(()=>state.annotations[0].color),line.color);
  await page.locator('[data-tool=select]').click();
  await page.locator('.annotation-card[data-id=master] .edit-annotation').click();await page.locator('#edit-shot-description').fill('Borrador conservado al seleccionar texto.');await page.locator('#link-line-script').click();
  await page.waitForFunction(()=>state.pasteHighlight?.kind==='script-link');assert(await page.locator('.topbar').evaluate(el=>el.inert));
  await selectRow(page);assert.equal(await page.evaluate(()=>state.annotations.length),4,'Seleccionar el fragmento no crea otro plano ni un resalte');assert(await page.locator('#paste-highlight-bar').isVisible());
  await page.locator('#apply-pasted-highlight').click();await page.locator('#edit-shot-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#edit-shot-description').inputValue(),'Borrador conservado al seleccionar texto.');assert((await page.locator('#edit-shot-text').textContent()).includes('Todo'));assert.equal(await page.evaluate(()=>state.annotations[0].scriptSelection),undefined);
  await page.locator('#edit-shot-form button[type=submit]').click();await page.waitForFunction(()=>!!state.annotations[0].scriptSelection);assert.equal(await page.evaluate(()=>state.annotations[0].description),'Borrador conservado al seleccionar texto.');
  await page.locator('#undo-button').click();assert.equal(await page.evaluate(()=>state.annotations[0].scriptSelection),undefined);await page.locator('#redo-button').click();
  await page.locator('.annotation-card[data-id=master] .edit-annotation').click();await page.locator('#reset-line-script').click();await page.locator('#cancel-edit-shot').click();assert(await page.evaluate(()=>!!state.annotations[0].scriptSelection),'Cancelar no borra el vínculo');
  await page.locator('.annotation-card[data-id=master] .edit-annotation').click();await page.locator('#reset-line-script').click();await page.locator('#edit-shot-form button[type=submit]').click();await page.waitForFunction(()=>!state.annotations[0].scriptSelection);await page.locator('#undo-button').click();
  await page.locator('.annotation-card[data-id=master] .edit-annotation').click();await page.locator('#link-line-script').click();await page.waitForFunction(()=>state.pasteHighlight?.kind==='script-link');await page.keyboard.press('Escape');await page.locator('#edit-shot-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#line-script-status').textContent(),'Texto vinculado');await page.locator('#cancel-edit-shot').click();
  // Persistencia de la selección geométrica y de la duración calculada.
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Nuevas funciones.pdf',mimeType:'application/pdf',buffer});await ready(page);assert((await page.evaluate(()=>state.annotations[0].scriptSelection[0].text)).includes('Todo'));
  await page.locator('#stage-tabs [data-stage=technical]').click();const row=page.locator('tr[data-shot-id=master]');assert.equal(await row.locator('.technical-duration').textContent(),'0:30');assert.equal(await page.locator('tr[data-shot-id=long] .technical-duration').first().textContent(),'2:00');
  await row.locator('.technical-script-eye').hover();await page.locator('#shot-script-tooltip').waitFor({state:'visible'});assert((await page.locator('#shot-script-tooltip').boundingBox()).height<250);await row.locator('.technical-script-eye').click();assert((await page.locator('#shot-script-full-text').textContent()).includes('Todo'));await page.keyboard.press('Escape');
  await page.locator('tr[data-shot-id=long] .technical-delete-shot').first().click();assert(!(await page.evaluate(()=>state.annotations.some(item=>item.id==='long'))));await page.locator('#technical-undo').click();assert(await page.evaluate(()=>state.annotations.some(item=>item.id==='long')));
  await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);
  await page.evaluate(()=>commitTechnicalField('master','sound','Ambiente y diálogo sin cortes. '.repeat(50)));
  await page.locator('#stage-tabs [data-stage=technical]').click({button:'right'});const opened=page.waitForEvent('popup');await page.locator('#technical-window-menu button').click();const other=await opened;other.on('pageerror',e=>errors.push(e.message));await other.locator('tr[data-shot-id=master]').waitFor();
  const childCell=()=>other.locator('tr[data-shot-id=master] [data-field=description]');await childCell().locator('.technical-cell-value').click();await childCell().locator('textarea').fill('Cambio desde la segunda ventana.');await other.keyboard.press('Control+Enter');await page.waitForFunction(()=>state.annotations[0].description==='Cambio desde la segunda ventana.');
  assert(await other.locator('tr[data-shot-id=master] [data-field=sound] .technical-cell-value').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'La segunda ventana también muestra completos los textos largos');
  await page.locator('.annotation-card[data-id=master] .edit-annotation').click();await other.waitForFunction(()=>document.querySelector('#technical-view').inert);await page.locator('#edit-shot-name').fill('Plano sincronizado');await page.locator('#edit-shot-form button[type=submit]').click();await other.locator('tr[data-shot-id=master] .technical-shot-name').filter({hasText:'Plano sincronizado'}).waitFor();
  await childCell().locator('.technical-cell-value').click();await childCell().locator('textarea').fill('Borrador antiguo');await page.evaluate(()=>commitTechnicalField('master','description','Cambio más reciente en el editor.'));
  assert.equal(await other.evaluate(()=>PlanoTechnicalScript.finishEditing()),false,'Un borrador no sobrescribe un cambio simultáneo del mismo campo');await other.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state.annotations[0].description),'Cambio más reciente en el editor.');
  await other.locator('tr[data-shot-id=master] .technical-delete-shot').click();await page.waitForFunction(()=>!state.annotations.some(item=>item.id==='master'));await other.locator('#technical-undo').click();await other.locator('tr[data-shot-id=master]').waitFor();assert(await page.evaluate(()=>state.annotations.some(item=>item.id==='master')));
  await page.locator('#toggle-theme').click();await other.waitForFunction(mode=>document.documentElement.dataset.theme===mode,await page.locator('html').getAttribute('data-theme'));
  await other.screenshot({path:path.join(out,'guion-tecnico-ventana-separada.png')});
  await other.locator('tr[data-shot-id=master] .technical-script-eye').click();await other.locator('#shot-script-dialog').waitFor({state:'visible'});
  await page.evaluate(()=>closeDocument());await other.locator('.detached-unavailable').waitFor();assert.equal(await other.locator('tr[data-shot-id]').count(),0,'Cerrar el documento elimina sus datos de la segunda ventana');
  assert(!(await other.locator('#shot-script-dialog').isVisible()));assert.equal(await other.locator('#shot-script-full-text').textContent(),'','También retira el fragmento de lectura que estaba abierto');
  assert.deepEqual(errors,[]);console.log('OK: negrita, color al crear, duraciones por geometría y páginas, texto vinculado con bloqueo/Listo/cancelación/historial/persistencia, ojo y lectura completa, borrado, ventanas editables sincronizadas, conflicto de celda, tema e invalidación.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
