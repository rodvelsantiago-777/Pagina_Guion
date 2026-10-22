/* Cuatro conversiones de plano, ficha completa, atajos y pegado de texto exclusivo. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const names=require('../shot-names.js'),copy=require('../shot-copy.js'),coverage=require('../coverage-lines.js');
const out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const fields={color:'#476bab',shotValue:'PMC',shotAngle:'other',shotAngleOther:'Rasante oblicua',shotLens:'macro',shotMovement:'other',shotMovementOther:'Movimiento propio',description:'Descripción completa del plano 🎬',grip:'Slider y trípode',sound:'Diálogo y ambiente',note:'Continuidad: conservar el vaso.'};
const source={...fields,id:'source',shotId:'original-shot',shotName:'P1',type:'line',page:1,endPage:2,start:{x:.83,y:.25},end:{x:.83,y:.4},lineLabel:{t:.15,side:'left'}};
const highlight={...fields,id:'h1',shotId:'highlight-shot',shotName:'P3',type:'highlight',page:1,rects:[{x:.15,y:.32,width:.25,height:.02}],text:'Texto original',labelPinned:true,labelPosition:{x:.6,y:.3}};
const notes=[source,highlight,{...highlight,id:'h2',page:2}, {...source,id:'last',shotId:'last-shot',shotName:'P7',endPage:undefined,page:1,start:{x:.93,y:.5},end:{x:.93,y:.6}}];
function metadata(item){return Object.fromEntries(Object.keys(fields).map(key=>[key,item[key]]));}
async function ready(page){await page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);}
async function pasteDialog(page){await page.keyboard.press('Control+v');await page.locator('#paste-shot-dialog').waitFor({state:'visible'});}
async function selectText(page,text='Ana ajusta la camara.',number=1){
 const spans=page.locator(`.page-slot[data-page="${number}"] .textLayer span`),first=spans.filter({hasText:/^Ana$/}).first(),last=spans.filter({hasText:'ajusta la camara.'}).first();
 await first.scrollIntoViewIfNeeded();const a=await first.boundingBox(),b=await last.boundingBox();
 await page.mouse.move(a.x+1,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width-2,b.y+b.height/2,{steps:12});await page.mouse.up();
}
(async()=>{
 const captured=copy.capture(notes,'source');notes[0].description='Cambio posterior';assert.equal(captured.base.description,fields.description);notes[0].description=fields.description;
 assert.equal(copy.capture(notes,'h2').parts.length,2);assert.equal(copy.nextName(notes,names.next),'P8');assert.equal(copy.nextName([{shotName:'PA'},{shotName:'PZ'}],names.next),'QA');assert.equal(copy.nextName([{shotName:'1A'},{shotName:'1B'}],names.next),'1C');
 const geometry=copy.line(captured,{page:2,y:.1},3,{width:952},coverage);assert(Math.abs((geometry.endPage-geometry.page+geometry.end.y-geometry.start.y)-1.15)<1e-9);
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(let number=1;number<=3;number++){const sheet=pdf.addPage([595,842]);if(number!==2)sheet.drawText('INT. ESTUDIO '+number+' - DIA',{x:65,y:770,size:12,font});sheet.drawText('Ana ajusta la camara.',{x:65,y:700,size:12,font});sheet.drawText('Todo esta preparado para la toma.',{x:65,y:640,size:12,font});}
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#file-input').setInputFiles({name:'Copiar.pdf',mimeType:'application/pdf',buffer});await ready(page);
  const fingerprint=await page.evaluate(()=>state.fingerprint);await page.locator('#backup-input').setInputFiles({name:'planos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:notes}))});await page.waitForFunction(()=>state.annotations.length===4);await ready(page);
  await page.locator('.annotation-card[data-id=source] .annotation-jump').click();await page.locator('#copy-shot-details').click();await pasteDialog(page);
  await page.screenshot({path:path.join(out,'pegar-plano-opciones.png')});await page.locator('#paste-as-line').click();await page.waitForFunction(()=>state.annotations.some(item=>item.shotName==='P8'));await ready(page);
  const line=await page.evaluate(()=>structuredClone(state.annotations.at(-1)));assert.equal(line.type,'line');assert.deepEqual(metadata(line),fields);assert.notEqual(line.id,source.id);assert.notEqual(line.shotId,source.shotId);assert.deepEqual(line.lineLabel,source.lineLabel);
  assert(Math.abs(coverage.endPage(line)-line.page+line.end.y-line.start.y-1.15)<1e-9);assert.deepEqual(await page.evaluate(()=>state.annotations.find(item=>item.id==='source')),await page.evaluate(()=>validateNotes([state.annotations.find(item=>item.id==='source')])[0]));
  assert(await page.locator('#copy-selected-line').isVisible());await page.locator('#copy-selected-line').click();await pasteDialog(page);await page.locator('#paste-as-highlight').click();await page.waitForFunction(()=>!!state.pasteHighlight);
  const theme=await page.locator('html').getAttribute('data-theme');const toggle=await page.locator('#toggle-theme').boundingBox();await page.mouse.click(toggle.x+toggle.width/2,toggle.y+toggle.height/2);assert.equal(await page.locator('html').getAttribute('data-theme'),theme,'Los controles permanecen bloqueados');
  assert.equal(await page.locator('.topbar').evaluate(el=>el.inert),true);assert.equal(await page.locator('.annotation-toolbar').evaluate(el=>el.inert),true);assert(await page.locator('#paste-highlight-bar').isVisible());
  await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>state.annotations.length),5);await page.screenshot({path:path.join(out,'pegar-plano-resaltado.png')});
  await selectText(page);await page.waitForFunction(()=>!state.pasteHighlight&&state.annotations.some(item=>item.shotName==='P9'));
  const pasted=await page.evaluate(()=>structuredClone(state.annotations.at(-1)));assert.equal(pasted.type,'highlight');assert.deepEqual(metadata(pasted),fields);assert(pasted.text.includes('Ana'));assert(!pasted.labelPosition);assert(!pasted.lineLabel);assert.equal(await page.locator('.topbar').evaluate(el=>el.inert),false);assert.equal(await page.evaluate(()=>state.tool),'select');
  // Clic en el resalte: opción pequeña de copiar sin abrir la ficha.
  const hit=await page.evaluate(id=>{const item=state.annotations.find(note=>note.id===id),c=[...state.viewer.contexts.values()].find(c=>c.segment.page===item.page&&c.content),b=c.content.getBoundingClientRect(),r=item.rects[0];return{x:b.left+(r.x+r.width/2)*b.width,y:b.top+(r.y+r.height/2)*b.height};},pasted.id);
  await page.mouse.click(hit.x,hit.y);await page.locator('#copy-highlight').waitFor({state:'visible'});await page.locator('#copy-highlight').click();await pasteDialog(page);await page.locator('#paste-as-line').click();await page.waitForFunction(()=>state.annotations.some(item=>item.shotName==='P10'));await ready(page);assert.deepEqual(metadata(await page.evaluate(()=>state.annotations.at(-1))),fields);
  // Ctrl+C en una línea seleccionada usa la misma copia y Ctrl+V siempre pregunta.
  await page.keyboard.press('Control+c');await pasteDialog(page);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state.annotations.length),7);await pasteDialog(page);await page.locator('#paste-as-highlight').click();await page.waitForFunction(()=>!!state.pasteHighlight);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state.annotations.length),7);assert.equal(await page.locator('.annotation-toolbar').evaluate(el=>el.inert),false);
  // Copiar el plano resaltado completo, de dos páginas, y volver a resaltar.
  await page.locator('.annotation-card[data-id=h1] .annotation-jump').click();await page.locator('#copy-shot-details').click();await pasteDialog(page);await page.locator('#paste-as-highlight').click();await page.waitForFunction(()=>!!state.pasteHighlight);
  await page.evaluate(async()=>{const contexts=[...state.viewer.contexts.values()].filter(c=>c.segment.page<=2);await Promise.all(contexts.map(ensurePage));const first=contexts.find(c=>c.segment.page===1).content.querySelector('.textLayer span'),last=[...contexts.find(c=>c.segment.page===2).content.querySelectorAll('.textLayer span')].at(-1);const range=document.createRange();range.setStart(first.firstChild,0);range.setEnd(last.firstChild,last.firstChild.length);getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.locator('#apply-pasted-highlight').click();await page.waitForFunction(()=>!state.pasteHighlight&&state.annotations.some(item=>item.shotName==='P11'));
  const parts=await page.evaluate(()=>structuredClone(state.annotations.filter(item=>item.shotName==='P11')));assert.equal(parts.length,2);assert.equal(new Set(parts.map(item=>item.shotId)).size,1);for(const item of parts)assert.deepEqual(metadata(item),fields);
  await page.locator('#undo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations.some(item=>item.shotName==='P11')),false);await page.locator('#redo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations.filter(item=>item.shotName==='P11').length),2);
  await page.locator('#stage-tabs [data-stage=technical]').click();assert.equal(await page.locator('#technical-table-body tr[data-shot-id]').count(),7,'Cada copia es una ficha independiente, aunque tenga varios tramos');
  await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);await page.locator('.annotation-card[data-id=source] .edit-annotation').click();await page.locator('#edit-shot-name').dispatchEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true});assert(!(await page.locator('#paste-shot-dialog').isVisible()),'Se respeta el pegado normal de formularios');await page.keyboard.press('Escape');
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Copiar.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.equal(await page.evaluate(()=>state.annotations.filter(item=>item.shotName==='P11').length),2);await page.keyboard.press('Control+v');assert(!(await page.locator('#paste-shot-dialog').isVisible()),'No persiste un portapapeles de datos privados');
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));
  await touch.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await touch.locator('#file-input').setInputFiles({name:'Copiar.pdf',mimeType:'application/pdf',buffer});await ready(touch);
  await touch.locator('#backup-input').setInputFiles({name:'planos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:notes}))});await touch.waitForFunction(()=>state.annotations.length===4);await ready(touch);
  if(await touch.locator('#annotations-panel').isHidden())await touch.locator('#toggle-annotations').click();
  await touch.locator('.annotation-card[data-id=source] .annotation-jump').click();await touch.locator('#copy-shot-details').click();await pasteDialog(touch);assert((await touch.locator('#paste-shot-dialog').boundingBox()).width<390);await touch.screenshot({path:path.join(out,'pegar-plano-movil.png')});
  await touch.locator('#paste-as-highlight').click();await touch.waitForFunction(()=>!!state.pasteHighlight);
  await touch.evaluate(()=>{const span=[...document.querySelectorAll('.textLayer span')].find(span=>span.textContent==='Ana');const range=document.createRange();range.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(range);});await touch.locator('#apply-pasted-highlight').click();await touch.waitForFunction(()=>!state.pasteHighlight&&state.annotations.some(item=>item.shotName==='P8'));
  assert.equal(await touch.locator('.topbar').evaluate(el=>el.inert),false);assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(metadata(await touch.evaluate(()=>state.annotations.at(-1))),fields);await mobile.close();
  assert.deepEqual(errors,[]);console.log('OK: snapshot completo, cuatro conversiones, numeración global, líneas largas, Ctrl+C/V, menús de copia, bloqueo exclusivo, selección real, cancelación, nombres sin huecos, historial, ficha única, recuperación y móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
