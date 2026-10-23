/* Colocación libre explícita, ajuste protegido y recuperación de rótulos del cajón. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib'),layout=require('../label-layout.js');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
const center=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
async function drag(page,locator,target){const start=center(await locator.boundingBox());await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:10});await page.mouse.up();await ready(page);}
async function toggle(page,id){await page.locator(`.document-shot-label[data-annotation-id="${id}"]`).click({button:'right'});await page.locator('#toggle-title-safety').click();await ready(page);}
(async()=>{
 const obstacle={x:120,y:100,width:160,height:50},rect={x:160,y:110,width:35,height:25},options={width:500,top:0,bottom:500,textBoxes:[obstacle],inkBlocked:()=>false};
 const safe=layout.nearestClear(rect,options);assert(safe&&layout.isClear(safe,options));assert(Math.hypot(safe.x-rect.x,safe.y-rect.y)<70,'Busca una alternativa cercana al destino');
 const highlight={id:'H',type:'highlight',width:35,height:25,manual:rect,anchor:{x:160,y:110,width:40,height:15},unrestricted:true};
 const free=layout.placeLabels({...options,labels:[highlight]})[0];assert.equal(free.x,rect.x);assert.equal(free.y,rect.y);assert(!layout.isClear(free,options),'La elección libre permite cubrir texto');
 const protectedTitle=layout.placeLabels({...options,labels:[{...highlight,unrestricted:false}]})[0];assert(layout.isClear(protectedTitle,options));
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([595,842]);
 sheet.drawText('INT. ESTUDIO - DIA '+ 'X'.repeat(100),{x:5,y:825,size:10,font});
 for(let y=810;y>=10;y-=12){if(y>=400&&y<=450)continue;sheet.drawText('X'.repeat(100),{x:5,y,size:10,font});}
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#file-input').setInputFiles({name:'Titulos.pdf',mimeType:'application/pdf',buffer});await ready(page);await page.locator('#scene-select').selectOption('print',{force:true});await ready(page);
  const source=[{id:'H',shotId:'H',shotName:'P19',type:'highlight',page:1,color:'#e8b83f',text:'Texto denso.',rects:[{x:.01,y:.25,width:.98,height:.02}]},{id:'L',shotId:'L',shotName:'P20',type:'line',page:1,color:'#64a7d9',start:{x:.5,y:.12},end:{x:.5,y:.8}}];
  await page.evaluate(notes=>{state.annotations=validateNotes(notes);changed();},source);await ready(page);
  const title=id=>page.locator(`.document-shot-tag[data-annotation-id="${id}"]`);
  assert.equal(await title('H').getAttribute('data-placement'),'overflow','Reproduce el título enviado al recuadro sin espacio');
  let paper=await page.locator('.page-window').boundingBox();
  await drag(page,title('H'),{x:paper.x+paper.width*.25,y:paper.y+paper.height*.5});
  assert.equal(await title('H').getAttribute('data-placement'),'paper','También permite sacar el título del cajón en modo protegido');
  await page.locator('#undo-button').click();assert.equal(await title('H').getAttribute('data-placement'),'overflow');
  await toggle(page,'H');assert(await page.evaluate(()=>state.annotations[0].labelUnrestricted));
  paper=await page.locator('.page-window').boundingBox();
  const target={x:paper.x+paper.width*.25,y:paper.y+paper.height*.25};
  await drag(page,title('H'),target);assert.equal(await title('H').getAttribute('data-placement'),'paper','El rótulo sale del cajón y vuelve a la página');
  const position=await page.evaluate(()=>structuredClone(state.annotations[0].labelPosition));assert(position&&Math.abs(position.x-.25)<.08&&Math.abs(position.y-.25)<.03);
  assert(await page.evaluate(()=>{const context=[...state.viewer.contexts.values()][0],p=context.labelPlacements.find(p=>p.id==='H');return context.inkBlocked(p);}),'El destino libre realmente se superpone a la tinta del PDF');
  await drag(page,title('H'),{x:paper.x+paper.width*.5,y:paper.y+paper.height*.25});
  assert(await page.evaluate(()=>{const c=[...state.viewer.contexts.values()][0],p=c.labelPlacements.find(p=>p.id==='H'),line={start:{x:c.viewport.width*.5,y:c.viewport.height*.12},end:{x:c.viewport.width*.5,y:c.viewport.height*.8}};return PlanoLabels.lineIntersects(p,line);}),'El modo libre permite también superponer otra marca');
  await title('H').locator('button').click({button:'right'});assert.equal(await page.locator('#toggle-title-safety').textContent(),'Volver a colocación protegida');await page.locator('#toggle-title-safety').click();await ready(page);
  assert.equal(await page.evaluate(()=>!!state.annotations[0].labelUnrestricted),false);
  assert(await page.evaluate(()=>{const c=[...state.viewer.contexts.values()][0],p=c.labelPlacements.find(p=>p.id==='H');return !p.sceneFallback&&!c.inkBlocked(p);}),'Volver a protección busca un hueco cercano y sin tinta');
  await page.locator('#undo-button').click();assert(await page.evaluate(()=>state.annotations[0].labelUnrestricted));await page.locator('#redo-button').click();assert(!(await page.evaluate(()=>state.annotations[0].labelUnrestricted)));
  // Arrastrar protegido sobre texto muestra y guarda un destino seguro, sin descartar el gesto.
  paper=await page.locator('.page-window').boundingBox();await drag(page,title('H'),{x:paper.x+paper.width*.75,y:paper.y+paper.height*.3});
  assert.equal(await title('H').getAttribute('data-placement'),'paper');assert(await page.evaluate(()=>{const c=[...state.viewer.contexts.values()][0];return !c.inkBlocked(c.labelPlacements.find(p=>p.id==='H'));}));
  // La raya conserva su geometría y su título sigue ligado, incluso en modo libre.
  await toggle(page,'L');await title('L').locator('button').click({button:'right'});assert(await page.locator('#toggle-title-pin').isHidden());await page.keyboard.press('Escape');
  paper=await page.locator('.page-window').boundingBox();await drag(page,title('L'),{x:paper.x+paper.width*.9,y:paper.y+paper.height*.2});
  const line=await page.evaluate(()=>structuredClone(state.annotations[1]));assert(line.labelUnrestricted&&line.lineLabel&&!line.labelPosition);assert.equal(line.lineLabel.side,'right');assert.deepEqual(line.start,source[1].start);assert.deepEqual(line.end,source[1].end);
  let box=await title('L').boundingBox();assert(Math.abs(box.x-(paper.x+paper.width*.5)-13)<3,'Mover el puntero lejos no separa el título de la raya');assert(Math.abs(line.lineLabel.t-(.2-.12)/(.8-.12))<.07);
  await toggle(page,'L');assert(!(await page.evaluate(()=>state.annotations[1].labelUnrestricted)));assert(await page.evaluate(()=>{const c=[...state.viewer.contexts.values()][0],p=c.labelPlacements.find(p=>p.id==='L');return !p.sceneFallback&&!c.inkBlocked(p);}));
  // Persistencia, validación, zoom y exportación con superposición deliberada.
  await toggle(page,'H');await drag(page,title('H'),target);const saved=await page.evaluate(()=>structuredClone(state.annotations[0]));
  assert(await page.evaluate(()=>validateNotes(state.annotations)[0].labelUnrestricted));assert(await page.evaluate(()=>{try{validateNotes([{...state.annotations[0],labelUnrestricted:'yes'}]);return false;}catch{return true;}}));
  await page.locator('#zoom-in').click();await ready(page);assert.deepEqual(await page.evaluate(()=>state.annotations[0].labelPosition),saved.labelPosition);await page.locator('#fit-width').click();await ready(page);
  await page.evaluate(()=>{const original=PlanoDocumentLabels.draw;globalThis.exportedTitlePositions=[];PlanoDocumentLabels.draw=(context,notes,options)=>{original(context,notes,options);if(options.pageOnly)exportedTitlePositions.push(...context.labelPlacements.filter(p=>p.id==='H').map(p=>({fallback:!!p.sceneFallback,x:p.x/context.viewport.width,y:p.y/context.viewport.height})));};});
  const downloading=page.waitForEvent('download');await page.locator('#project-menu summary').click();await page.locator('#export-pdf').click();await (await downloading).saveAs(path.join(output,'titulos-libres.pdf'));await page.waitForFunction(()=>!state.exporting);
  const exported=await page.evaluate(()=>exportedTitlePositions[0]);assert(!exported.fallback);assert(Math.abs(exported.x-saved.labelPosition.x)<.002&&Math.abs(exported.y-saved.labelPosition.y)<.002,'El PDF respeta la posición libre aunque haya texto debajo');
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Titulos.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].labelUnrestricted),true);assert.deepEqual(await page.evaluate(()=>state.annotations[0].labelPosition),saved.labelPosition);
  await page.screenshot({path:path.join(output,'titulos-colocacion-libre.png'),fullPage:true});assert.deepEqual(errors,[]);
  console.log('OK: cajón a página, modo libre sobre texto, ajuste cercano protegido, rayas ligadas en ambos modos, menú dinámico, historial, zoom, JSON, recuperación y PDF con posición deliberada.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
