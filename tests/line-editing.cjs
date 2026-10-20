/* Interacciones reales de ratón, teclado y pantalla táctil sobre la geometría de las líneas. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES,name) : name);
const {chromium} = load('playwright');
const {PDFDocument,StandardFonts} = load('pdf-lib');
const output=path.join(__dirname,'.output'); fs.mkdirSync(output,{recursive:true});
async function ready(page) {
  await page.waitForFunction(()=>document.querySelector('#render-status').hidden && document.querySelector('.page-slot[data-ready="true"] .textLayer') && document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');
}
async function notes(page) { return page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('plano-notes-v1:')))).annotations); }
async function line(page) { return (await notes(page)).find(item=>item.type==='line'); }
function geometry(item) { return {start:item.start,end:item.end}; }
async function nameShot(page,name) {
  await page.locator('#shot-name-dialog').waitFor({state:'visible'}); await page.locator('#shot-name-input').fill(name);
  await page.locator('#shot-name-input').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#shot-name-dialog').open && !document.querySelector('.pending-annotation'));
}
async function drag(page,from,to) {
  await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y,{steps:10}); await page.mouse.up();
}
async function midpoint(page) { const r=await page.locator('.annotation-overlay line').boundingBox(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }
async function endpoint(page,which) { const r=await page.locator(`.line-handle-hit[data-endpoint="${which}"]`).boundingBox(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }
async function select(page) { await page.mouse.click(...Object.values(await midpoint(page))); }
async function mode(page,value) {
  if (!(await page.locator('#view-mode-button').isVisible())) await page.locator('#toggle-annotations').click();
  await page.locator('#scene-select').selectOption(value, {force:true}); await ready(page);
}
async function createLine(page) {
  await page.locator('button[data-tool="line"]').click(); const r=await page.locator('.page-window').boundingBox();
  await drag(page,{x:r.x+r.width*.8,y:r.y+r.height*.16},{x:r.x+r.width*.8,y:r.y+r.height*.30}); await nameShot(page,'L1');
  await page.locator('button[data-tool="select"]').click();
}
(async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([595,842]);
  for(const [text,y] of [['INT. CASA - DIA',770],['Ana abre la puerta lentamente.',730],['EXT. CALLE - NOCHE',430],['Una luz se enciende en la calle.',390]]) sheet.drawText(text,{x:65,y,size:12,font});
  const buffer=Buffer.from(await pdf.save());
  const browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
  const base=process.env.PLANO_TEST_URL || pathToFileURL(path.resolve(__dirname,'../index.html')).href;
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1540,height:1100}}); page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base); await page.locator('#file-input').setInputFiles({name:'lineas.pdf',mimeType:'application/pdf',buffer}); await ready(page); await mode(page,'print');
    assert.equal(await page.locator('.reader-help,#scene-notice,#tool-help').count(),0);
    await createLine(page); const original=await line(page);
    await select(page); assert.equal(await page.locator('.line-handle-hit').count(),2);
    assert(!(await page.locator('#edit-shot-dialog').isVisible()),'Pulsar una línea no abre su configuración');
    assert.deepEqual(await line(page),original,'Seleccionar no modifica el plano');
    await page.screenshot({path:path.join(output,'linea-seleccionada.png'),fullPage:true});
    const middle=await midpoint(page),paper=await page.locator('.page-window').boundingBox();
    await page.mouse.move(middle.x,middle.y); await page.mouse.down(); await page.mouse.move(middle.x-80,middle.y+30,{steps:10});
    assert.deepEqual(await line(page),original,'El arrastre muestra una previsualización sin guardar antes de soltar');
    await page.mouse.up(); const moved=await line(page);
    for(const end of ['start','end']) {
      assert(Math.abs(moved[end].x-original[end].x+80/paper.width)<1e-6);
      assert(Math.abs(moved[end].y-original[end].y-30/paper.height)<1e-6);
    }
    assert.equal(moved.shotName,original.shotName); assert.equal(moved.color,original.color);
    await page.locator('#undo-button').click(); assert.deepEqual(geometry(await line(page)),geometry(original),'Un solo deshacer revierte todo el arrastre');
    await page.locator('#redo-button').click(); assert.deepEqual(geometry(await line(page)),geometry(moved));
    await select(page); const end=await endpoint(page,'end');
    await drag(page,end,{x:end.x+25,y:end.y+70}); const resized=await line(page);
    assert.deepEqual(resized.start,moved.start,'Redimensionar el fin conserva el inicio'); assert.notDeepEqual(resized.end,moved.end);
    const start=await endpoint(page,'start'); await page.keyboard.down('Shift');
    await drag(page,start,{x:start.x+15,y:start.y-35}); await page.keyboard.up('Shift');
    const resizedStart=await line(page); assert.deepEqual(resizedStart.end,resized.end);
    assert.equal(resizedStart.start.x,resizedStart.end.x,'Mayús ajusta la dirección durante el cambio de tamaño');
    const endAgain=await endpoint(page,'end'),startAgain=await endpoint(page,'start');
    await drag(page,endAgain,startAgain); assert.deepEqual(geometry(await line(page)),geometry(resizedStart),'No guarda una línea colapsada');
    const cancelPoint=await midpoint(page); await page.mouse.move(cancelPoint.x,cancelPoint.y); await page.mouse.down();
    await page.mouse.move(cancelPoint.x-60,cancelPoint.y+30,{steps:6}); await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual(geometry(await line(page)),geometry(resizedStart),'Escape cancela un movimiento');
    assert.equal(await page.locator('.line-handle-hit').count(),0); assert.equal(await page.locator('.is-transforming-line').count(),0);
    await page.locator('.line-hit-target').focus(); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight'); const keyed=await line(page);
    assert(Math.abs(keyed.start.x-resizedStart.start.x-1/paper.width)<1e-6,'Flechas mueven la línea con precisión');
    await page.locator('.line-handle-hit[data-endpoint="end"]').focus(); await page.keyboard.press('Shift+ArrowDown');
    const keyboardResize=await line(page); assert.deepEqual(keyboardResize.start,keyed.start);
    assert(Math.abs(keyboardResize.end.y-keyed.end.y-10/paper.height)<1e-6);
    assert(!(await page.locator('#edit-shot-dialog').isVisible()),'El teclado también modifica la geometría, no los datos');
    await page.locator('button[data-tool="select"]').click();
    await page.evaluate(()=>{
      const span=[...document.querySelectorAll('.textLayer span')].find(el=>el.textContent.includes('abre la puerta'));
      const range=document.createRange(); range.selectNodeContents(span); getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    await page.locator('#apply-highlight').click(); await nameShot(page,'H1');
    const highlight=await page.locator('.annotation-overlay rect').boundingBox();
    await page.mouse.click(highlight.x+highlight.width/2,highlight.y+highlight.height/2);
    await page.locator('#highlight-action').waitFor({state:'visible'});
    assert(await page.locator('#correct-highlight').isVisible(),'Pulsar el resalte ofrece corregir su selección en un botón pequeño');
    assert(!(await page.locator('#shot-details-dialog').isVisible()));
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#edit-shot-dialog').isVisible())); assert.equal(await page.locator('.line-handle-hit').count(),0);
    assert.equal(await page.locator('.annotation-overlay rect~.line-hit-target').count(),0,'Los resaltes no tienen controles interactivos');
    await mode(page,'scene-1'); const beforeScene=await line(page);
    const sceneMiddle=await midpoint(page); await drag(page,sceneMiddle,{x:sceneMiddle.x+25,y:sceneMiddle.y+15});
    const sceneMoved=await line(page); assert.notDeepEqual(geometry(sceneMoved),geometry(beforeScene));
    await mode(page,'all'); assert.deepEqual(geometry(await line(page)),geometry(sceneMoved));
    await mode(page,'print'); await page.locator('#zoom-in').click(); await ready(page);
    assert.deepEqual(geometry(await line(page)),geometry(sceneMoved),'Escenas y zoom conservan las nuevas coordenadas');
    const download=page.waitForEvent('download'); await page.locator('#project-menu summary').click(); await page.locator('#save-backup').click();
    const backup=await download,backupPath=path.join(output,'lineas-editadas.json'); await backup.saveAs(backupPath);
    assert.deepEqual(geometry(JSON.parse(fs.readFileSync(backupPath,'utf8')).annotations.find(item=>item.type==='line')),geometry(sceneMoved));
    await page.reload(); await page.locator('#file-input').setInputFiles({name:'lineas.pdf',mimeType:'application/pdf',buffer}); await ready(page);
    assert.deepEqual(geometry(await line(page)),geometry(sceneMoved),'Recupera las líneas modificadas al volver a abrir el PDF');
    await mode(page,'scene-1'); await select(page);
    const bounds=await page.locator('.page-window').boundingBox(),edgePoint=await midpoint(page);
    await drag(page,edgePoint,{x:bounds.x-150,y:bounds.y-150}); const clamped=await line(page);
    assert(Math.min(clamped.start.x,clamped.end.x)>=0 && Math.max(clamped.start.x,clamped.end.x)<=1,'No sale de la página');
    await page.locator('#undo-button').click(); assert.deepEqual(geometry(await line(page)),geometry(sceneMoved));

    const context=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true});
    const mobile=await context.newPage(); mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.goto(base); await mobile.locator('#file-input').setInputFiles({name:'tactil.pdf',mimeType:'application/pdf',buffer}); await ready(mobile); await mode(mobile,'print');
    await createLine(mobile); const touchOriginal=await line(mobile),touchMiddle=await midpoint(mobile);
    await mobile.touchscreen.tap(touchMiddle.x,touchMiddle.y);
    assert.equal(await mobile.locator('.line-handle-hit').count(),2,'Un toque muestra los extremos');
    const client=await context.newCDPSession(mobile),scrollBefore=await mobile.locator('#pdf-stage').evaluate(el=>el.scrollTop);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchMiddle.x,y:touchMiddle.y,id:1}]});
    for(let step=1;step<=5;step++) await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchMiddle.x-25*step/5,y:touchMiddle.y+20*step/5,id:1}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notDeepEqual(geometry(await line(mobile)),geometry(touchOriginal),'Permite arrastrar la línea con el dedo');
    assert(Math.abs(await mobile.locator('#pdf-stage').evaluate(el=>el.scrollTop)-scrollBefore)<2,'Arrastrar la línea no desplaza el visor');
    const touchMoved=await line(mobile),touchEnd=await endpoint(mobile,'end');
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchEnd.x,y:touchEnd.y,id:2}]});
    for(let step=1;step<=5;step++) await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchEnd.x,y:touchEnd.y+25*step/5,id:2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const touchResized=await line(mobile);
    assert.deepEqual(touchResized.start,touchMoved.start); assert(touchResized.end.y>touchMoved.end.y,'Permite redimensionar desde un extremo con el dedo');
    await mobile.screenshot({path:path.join(output,'linea-tactil.png'),fullPage:true});
    await context.close(); assert.deepEqual(errors,[]);
    console.log('OK: ayuda retirada, selección sin diálogo, mover, redimensionar ambos extremos, Mayús, Escape, tamaño mínimo, teclado, deshacer/rehacer, acceso a corregir resaltados, escenas, zoom, guardado, JSON y arrastre táctil.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
