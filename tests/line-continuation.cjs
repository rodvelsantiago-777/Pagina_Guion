/* Regresión: prolongar sujetando el extremo y usando la rueda, sin mover el ratón.
 * Navegadores reales en modo de pruebas; no toca cuentas ni proyectos de nube. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
async function ready(page){await page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);}
async function create(page,buffer,view='all'){
 await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.locator('#file-input').setInputFiles({name:'Continuacion.pdf',mimeType:'application/pdf',buffer});await ready(page);
 if(view!=='all'){await page.locator('#scene-select').selectOption(view,{force:true});await ready(page);}
 await page.locator('[data-tool=line]').click();
 const start=await page.evaluate(()=>{const c=[...state.viewer.contexts.values()][0],b=c.content.getBoundingClientRect();return{x:b.left+.86*b.width,y:b.top+.16*b.height,end:b.top+.26*b.height};});
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x,start.end,{steps:10});await page.mouse.up();
 await page.locator('#shot-name-dialog').waitFor({state:'visible'});await page.locator('#shot-name-input').fill('Secuencia');await page.locator('#shot-name-input').press('Enter');
 await page.waitForFunction(()=>state.annotations.length===1&&!state.pending);await ready(page);await page.locator('[data-tool=select]').click();
 const box=await page.locator('.annotation-overlay line').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.locator('.line-handle-hit[data-endpoint=end]').waitFor();
 return page.evaluate(()=>structuredClone(state.annotations[0]));
}
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(let n=1;n<=4;n++){
  const sheet=pdf.addPage([595,842]);if(n===1||n===3)sheet.drawText(`INT. ESTUDIO ${n} - DIA`,{x:65,y:770,size:12,font});
  for(let y=700;y>90;y-=40)sheet.drawText('Una accion larga continua por todo el guion.',{x:65,y,size:12,font});
 }
 const buffer=Buffer.from(await pdf.save());
 for(const engine of ['edge','brave']){
  const browser=await require('./editor-auth-fixture.cjs').launch(chromium,engine==='edge'?{channel:'msedge',headless:true}:{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
  const errors=[];
  try{
   for(const view of ['all','editing','print','scene-1']){
    const context=await browser.newContext({viewport:{width:1366,height:650}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const original=await create(page,buffer,view),handle=await page.locator('.line-handle-hit[data-endpoint=end]').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.wheel(0,1250);
    await page.waitForFunction(()=>state.lineGesture?.draft.endPage===2,undefined,{timeout:5000});
    assert.equal(await page.evaluate(()=>state.annotations[0].endPage),undefined,'La rueda solo previsualiza hasta soltar');
    await page.mouse.up();await ready(page);
    const extended=await page.evaluate(()=>structuredClone(state.annotations[0]));assert.equal(extended.endPage,2,`${engine}/${view}: cruza sin mover el puntero`);
    assert.deepEqual(extended.start,original.start);assert.equal(extended.id,original.id);assert.equal(extended.shotId,original.shotId);assert.equal(await page.locator('.annotation-card').count(),1);
    await page.locator('#undo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),undefined);await page.locator('#redo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),2);
    await context.close();console.log(`OK ${engine}/${view}: rueda sin movimiento del ratón, zoom normal, ficha única e historial.`);
   }
   const context=await browser.newContext({viewport:{width:1366,height:650}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const original=await create(page,buffer,'scene-1');
   for(const number of [2,3,4]){
    await page.locator('#continue-line').click();await page.waitForFunction(number=>state.annotations[0].endPage===number,number);await ready(page);
    await page.locator('.line-handle-hit[data-endpoint=end]').waitFor();
    assert.equal(await page.locator('.annotation-card').count(),1);assert.equal(await page.evaluate(()=>state.annotations[0].id),original.id);assert.equal(await page.evaluate(()=>state.annotations[0].shotId),original.shotId);
    if(number===2){assert(await page.locator('#continue-line').isVisible());await page.screenshot({path:path.join(out,`continuar-linea-${engine}.png`)});}
   }
   assert.equal(await page.evaluate(()=>state.scene),'all','Continuar abre el siguiente tramo aunque esté en otra escena');assert(await page.locator('#continue-line').isDisabled(),'No añade páginas inexistentes');
   await page.locator('#undo-button').click();await ready(page);assert.equal(await page.evaluate(()=>state.annotations[0].endPage),3);await page.locator('#redo-button').click();await ready(page);
   await context.close();
   const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));
   await create(touch,buffer,'scene-1');await touch.locator('#continue-line').click();await touch.waitForFunction(()=>state.annotations[0].endPage===2);await ready(touch);
   assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await touch.locator('.annotation-card').count(),1);await mobile.close();
   assert.deepEqual(errors,[]);console.log(`OK ${engine}: continuar con botón entre escenas, última página, identidad, historial y móvil.`);
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
