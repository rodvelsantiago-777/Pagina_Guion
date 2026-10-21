/* Arrastre real entre páginas, extremos, autoscroll, guardado y PDF exportado. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const lines=require('../coverage-lines.js');
const out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const base=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
async function ready(page){await page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);}
async function point(page,number,y,x=.86){return page.evaluate(({number,y,x})=>{const c=[...state.viewer.contexts.values()].find(c=>c.segment.page===number),b=c.crop.getBoundingClientRect();return{x:b.left+x*c.viewport.width,y:b.top+(y-c.segment.top)*c.viewport.height};},{number,y,x});}
async function scroll(page,number,y=.35){await page.evaluate(({number,y})=>{const c=[...state.viewer.contexts.values()].find(c=>c.segment.page===number);const stage=document.querySelector('#pdf-stage');stage.scrollTop+=c.crop.getBoundingClientRect().top-stage.getBoundingClientRect().top+y*c.viewport.height-300;return ensurePage(c);},{number,y});}
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();}
(async()=>{
 const long={type:'line',page:1,endPage:3,start:{x:.8,y:.7},end:{x:.8,y:.4}};
 assert.equal(lines.onPage([long],2).length,1);assert.deepEqual(lines.part(long,2).start,{x:.8,y:0});
 assert.equal(lines.part(long,2).continuesBefore,true);assert.equal(lines.part(long,2).continuesAfter,true);
 assert.equal(lines.part(long,4),null);assert.deepEqual(lines.fromEnds({page:3,x:.8,y:.4},{page:1,x:.8,y:.7}),{page:1,endPage:3,start:{x:.8,y:.7},end:{x:.8,y:.4}});
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(let n=1;n<=3;n++){
  const sheet=pdf.addPage([595,n===2?900:842]);
  if(n===1)sheet.drawText('INT. ESTUDIO - DIA',{x:65,y:770,size:12,font});
  for(let y=690;y>90;y-=55)sheet.drawText(`Accion continua del plano. Pagina ${n}.`,{x:65,y,size:12,font});
 }
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1100},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#file-input').setInputFiles({name:'Plano largo.pdf',mimeType:'application/pdf',buffer});await ready(page);
  await page.locator('#scene-select').selectOption('print',{force:true});await ready(page);
  while(await page.evaluate(()=>state.zoom)>.5){await page.locator('#zoom-out').click();await ready(page);}
  await page.evaluate(()=>Promise.all([...state.viewer.contexts.values()].map(ensurePage)));
  await page.locator('[data-tool=line]').click();
  await drag(page,await point(page,1,.7),await point(page,2,.35));
  await page.locator('#shot-name-dialog').waitFor({state:'visible'});await page.locator('#shot-name-input').fill('Plano secuencia');await page.locator('#shot-name-input').press('Enter');await page.waitForFunction(()=>state.annotations.length===1&&!state.pending);await ready(page);
  let note=await page.evaluate(()=>structuredClone(state.annotations[0]));
  assert.equal(note.page,1);assert.equal(note.endPage,2);assert.equal(await page.locator('.annotation-card').count(),1);assert.equal(await page.locator('.coverage-cap').count(),2,'Solo hay remates en el inicio y fin reales');
  assert.equal(await page.locator('.annotation-overlay line').count(),2);assert((await page.locator('.annotation-kind').textContent()).includes('1–2'));
  await page.locator('[data-tool=select]').click();await page.mouse.click(...Object.values(await point(page,2,.2)));
  assert.equal(await page.locator('.line-handle-hit').count(),2);
  const endpoint=await page.locator('.line-handle-hit[data-endpoint=end]').boundingBox();await page.mouse.move(endpoint.x+endpoint.width/2,endpoint.y+endpoint.height/2);await page.mouse.down();
  await scroll(page,3,.4);const end=await point(page,3,.4);await page.mouse.move(end.x,end.y,{steps:12});await page.mouse.up();await ready(page);
  const extended=await page.evaluate(()=>structuredClone(state.annotations[0]));assert.equal(extended.endPage,3);assert.deepEqual(extended.start,note.start);assert.equal(extended.id,note.id);assert.equal(extended.shotId,note.shotId);
  assert.equal(await page.locator('.annotation-card').count(),1);assert.equal(await page.locator('.annotation-overlay line').count(),3);assert.equal(await page.locator('.coverage-cap').count(),2);
  await page.locator('#undo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),2);await page.locator('#redo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),3);
  // Probar autoscroll con el puntero inmóvil cerca del borde, también al redimensionar.
  await scroll(page,3,.4);await page.mouse.click(...Object.values(await point(page,3,.25)));const handle=await page.locator('.line-handle-hit[data-endpoint=end]').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  const stage=await page.locator('#pdf-stage').boundingBox(),beforeScroll=await page.locator('#pdf-stage').evaluate(el=>el.scrollTop);
  await page.mouse.move(end.x,stage.y+20,{steps:8});await page.waitForFunction(before=>document.querySelector('#pdf-stage').scrollTop<before-70,beforeScroll);
  await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await page.evaluate(()=>state.annotations[0]),extended,'Escape cancela el redimensionado entre páginas');
  assert.equal(await page.evaluate(()=>coverageScrollFrame),0);
  await page.locator('#scene-select').selectOption('scene-1',{force:true});await ready(page);
  await page.evaluate(()=>Promise.all([...state.viewer.contexts.values()].map(ensurePage)));
  assert.equal(await page.locator('.annotation-overlay line').count(),3,'Se ven los tramos en la vista por escenas');
  await page.locator('#stage-tabs [data-stage=technical]').click();assert.equal(await page.locator('#technical-table-body tr[data-shot-id]').count(),1,'Un solo plano en el guion técnico');
  // La geometría nueva atraviesa la misma validación usada por la nube y por JSON.
  assert.equal(await page.evaluate(()=>validateNotes(state.annotations)[0].endPage),3);
  for(const endPage of [0,4,1.5,'3'])assert(await page.evaluate(endPage=>{try{validateNotes([{...state.annotations[0],endPage}]);return false;}catch{return true;}},endPage));
  const download=page.waitForEvent('download');await page.locator('#project-menu summary').click();await page.locator('#export-pdf').click();const file=await download;const filename=path.join(out,'plano-multipagina.pdf');await file.saveAs(filename);await page.waitForFunction(()=>!state.exporting);
  const exported=fs.readFileSync(filename);assert.equal((await PDFDocument.load(exported)).getPageCount(),3);
  const strokes=await page.evaluate(async bytes=>{
   const output=await pdfjsLib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,BinaryDataFactory:LocalBinaryFactory}).promise;
   const samples=[];
   for(let n=1;n<=3;n++){const sheet=await output.getPage(n),v=sheet.getViewport({scale:1}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await sheet.render({canvasContext:c.getContext('2d'),viewport:v}).promise;const y=n===1?.85:n===2?.5:.2;const color=c.getContext('2d').getImageData(Math.floor(.86*v.width),Math.floor(y*v.height),1,1).data;samples.push([...color]);}
   await output.destroy();return samples;
  },[...exported]);
  assert(strokes.every(color=>color[0]<250||color[1]<250||color[2]<250),'El PDF exportado contiene el trazo en las tres páginas');
  await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);await scroll(page,1,.7);await page.locator('[data-tool=line]').click();
  const beginning=await point(page,1,.7),scrollStart=await page.locator('#pdf-stage').evaluate(el=>el.scrollTop),stageBox=await page.locator('#pdf-stage').boundingBox();
  await page.mouse.move(beginning.x,beginning.y);await page.mouse.down();await page.mouse.move(beginning.x,stageBox.y+stageBox.height-15,{steps:12});
  await page.waitForFunction(before=>document.querySelector('#pdf-stage').scrollTop>before+140,scrollStart);await page.mouse.up();await page.locator('#shot-name-dialog').waitFor({state:'visible'});
  assert(await page.evaluate(()=>state.pending.items[0].endPage>=2),'Autoscroll permite crear un plano entre páginas sin soltar el puntero');
  await page.locator('#cancel-shot-name').click();await page.waitForFunction(()=>!state.pending);assert.equal(await page.evaluate(()=>state.annotations.length),1);assert.equal(await page.evaluate(()=>coverageScrollFrame),0);
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Plano largo.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),3,'El guardado conserva la página final');
  await page.screenshot({path:path.join(out,'plano-multipagina.png')});assert.deepEqual(errors,[]);
  console.log('OK: línea única entre 2/3 páginas, prolongación desde el extremo, distintas alturas, remates reales, autoscroll, Escape, historial, escena, ficha única, validación, recuperación y PDF exportado.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
