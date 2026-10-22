/* Requiere Node.js, playwright, pdf-lib y Microsoft Edge. No modifica documentos del usuario. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES, name) : name);
const { chromium } = load('playwright');
const { PDFDocument, StandardFonts, rgb } = load('pdf-lib');
const scenes = require('../scene-analysis.js');
const layout = require('../label-layout.js');
const names = require('../shot-names.js');
const output = path.join(__dirname, '.output');
fs.mkdirSync(output, { recursive: true });

async function fixture(scanned = false) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Courier);
  const page = document.addPage([595,842]);
  if (scanned) page.drawRectangle({x:50,y:50,width:300,height:500,color:rgb(.9,.9,.9)});
  else {
    const line = (p,text,y) => p.drawText(text,{x:65,y,size:12,font});
    line(page,'LA PRIMERA TOMA',810);
    line(page,'1 INT. CASA - DÍA',770);
    line(page,'Ana abre la puerta lentamente.',730);
    line(page,'ANA',695); line(page,'Hoy comienza nuestra historia.',675);
    line(page,'2 EXT. CALLE - NOCHE',500);
    line(page,'La calle permanece vacía.',460);
    const second = document.addPage([595,842]);
    line(second,'Una luz se enciende al final de la calle.',770);
    line(second,'3 INT./EXT. COCHE - DÍA',500);
    line(second,'Ana mira por la ventanilla.',460);
  }
  return Buffer.from(await document.save());
}

async function ready(page) {
  await page.waitForFunction(()=>!document.querySelector('#document-view').hidden && document.querySelector('.page-slot[data-ready="true"] .textLayer') && document.querySelector('#render-status').hidden && document.querySelector('.script-workspace').getAttribute('aria-busy')!=='true');
}
async function menuAction(page, id) { await page.locator('#project-menu summary').click(); await page.locator(id).click(); }
async function pageReady(page, number) { await page.locator(`.page-slot[data-page="${number}"][data-ready="true"]`).waitFor(); }
async function nameShot(page, name) {
  await page.locator('#shot-name-dialog').waitFor({state:'visible'});
  await page.locator('#shot-name-input').fill(name);
  await page.locator('#shot-name-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#shot-name-dialog').open && !document.querySelector('.pending-annotation'));
}
async function saveEdit(page) {
  await page.locator('#edit-shot-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#edit-shot-dialog').open);
}
async function chooseColor(page,color) {
  await page.locator('#edit-color-launch').click();
  await page.locator('#choose-custom-color').click();
  await page.locator('#custom-color-hex').fill(color);
  await page.locator('#save-custom-color').click();
}
async function storedNotes(page) {
  return page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('plano-notes-v1:')))).annotations);
}
async function assertLabelClearance(page) {
  const collisions=await page.evaluate(()=>{
    const overlaps=(a,b,pad=1)=>a.left<b.right+pad&&a.right+pad>b.left&&a.top<b.bottom+pad&&a.bottom+pad>b.top;
    const issues=[];
    const labels=[...document.querySelectorAll('.document-shot-tag')];
    for(const [index,label] of labels.entries()) {
      const box=label.getBoundingClientRect();
      const slot=label.closest('.page-slot');
      for(const text of slot.querySelectorAll('.textLayer span')) if(text.textContent.trim()&&overlaps(box,text.getBoundingClientRect())) issues.push(`texto: ${label.textContent}`);
      for(const shape of slot.querySelectorAll('.annotation-overlay rect,.annotation-overlay line,.coverage-cap')) {
        const rect=shape.getBoundingClientRect();
        if(overlaps(box,{left:rect.left-2,right:rect.right+2,top:rect.top-2,bottom:rect.bottom+2})) issues.push(`marca: ${label.textContent}`);
      }
      for(const other of labels.slice(index+1)) if(overlaps(box,other.getBoundingClientRect())) issues.push(`nombre: ${label.textContent}`);
      if(label.dataset.placement==='margin'&&box.left<slot.querySelector('.page-window').getBoundingClientRect().right+10) issues.push('margen dentro del PDF');
    }
    return issues;
  });
  assert.deepEqual(collisions,[],'Nombres separados de texto, marcas y otros nombres');
}

(async()=>{
  for (const heading of ['INT. CASA - DÍA','12 EXT. CALLE - NOCHE','3A. INT./EXT. COCHE - DÍA','INT / EXT. ESTACIÓN - DÍA','ESCENA 7 - INTERIOR. CASA - NOCHE','I/E. COCHE - DÍA','int. casa - día']) assert(scenes.isSceneHeading(heading),heading);
  for (const text of ['ANA','INTENTO ABRIR LA PUERTA','La casa está vacía.','INTERESANTE','EXTRAÑO']) assert(!scenes.isSceneHeading(text),text);
  const sample = scenes.detectScenes([{lines:[{text:'INT. CASA - DÍA',y:.1},{text:'EXT. CALLE - NOCHE',y:.6}]},{lines:[{text:'INT./EXT. COCHE - DÍA',y:.5}]}]);
  assert.equal(sample.length,3);
  assert.equal(scenes.segmentsForScene(sample[0],2).length,1);
  assert.equal(scenes.segmentsForScene(sample[1],2).length,2);
  assert.equal(scenes.sceneAt(sample,2,.7).number,3);
  assert(layout.lineIntersects({x:45,y:45,width:20,height:20},{start:{x:0,y:0},end:{x:100,y:100}}));
  assert(!layout.lineIntersects({x:0,y:90,width:10,height:10},{start:{x:0,y:0},end:{x:100,y:100}}));
  const packed=layout.placeLabels({width:300,top:0,bottom:180,inlineAllowed:false,labels:Array.from({length:12},(_,i)=>({id:String(i),type:'highlight',anchor:{x:20,y:20,width:40,height:10},width:180,height:40}))});
  assert(packed.every(item=>item.sceneFallback),'Agrupa los nombres sin hueco junto al indicador de escena');
  for(const [name,next] of [['1','2'],['PA','PB'],['P1','P2'],['1A','1B'],['P009','P010'],['Z','AA'],['PZ','QA'],['1AZ','1BA']]) assert.equal(names.next(name),next);
  assert.equal(names.nextScene('1A'),'2A'); assert.equal(names.nextScene('P1'),'P2'); assert.equal(names.nextScene('PA'),'PB');
  const shots=[{id:'a',shotName:'1A',type:'line',page:1,start:{y:.2}},{id:'b',shotName:'1B',type:'line',page:1,start:{y:.3}}];
  assert.equal(names.suggest(shots,sample,{type:'line',page:1,start:{y:.4}},scenes.sceneAt),'1C');
  assert.equal(names.suggest(shots,sample,{type:'line',page:1,start:{y:.7}},scenes.sceneAt),'2A','Nueva escena parte del primer plano anterior, no del último');
  const descriptor={id:'x',type:'highlight',width:45,height:22,anchor:{x:130,y:100,width:80,height:15},sceneAnchor:{x:50,y:40,width:100,height:15}};
  const opts={width:400,top:0,bottom:400,labels:[descriptor]};
  assert.equal(layout.placeLabels(opts)[0].tier,'side');
  const sides=[{x:0,y:90,width:125,height:50},{x:220,y:90,width:180,height:50}];
  assert.equal(layout.placeLabels({...opts,textBoxes:sides})[0].tier,'above-below','Solo pasa arriba/abajo tras descartar ambos lados');
  assert.equal(layout.placeLabels({...opts,textBoxes:[...sides,{x:120,y:60,width:100,height:110}]})[0].tier,'heading');

  const pdf = await fixture(); const scanned = await fixture(true);
  fs.writeFileSync(path.join(output,'guion-prueba.pdf'),pdf);
  const browser = await require('./editor-auth-fixture.cjs').launch(chromium,{ channel:'msedge',headless:true });
  try {
    const page = await browser.newPage({viewport:{width:1540,height:1100}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const base=process.env.PLANO_TEST_URL || pathToFileURL(path.resolve(__dirname,'../index.html')).href;
    await page.goto(base);
    assert(!(await page.locator('#editor-home').isVisible()),'Los controles del editor no aparecen en la portada');
    assert(await page.locator('.page-description').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=15));
    await page.screenshot({path:path.join(output,'portada-escritorio.png'),fullPage:true});
    await page.setViewportSize({width:390,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Portada móvil sin desbordamiento');
    await page.screenshot({path:path.join(output,'portada-movil.png'),fullPage:true});
    await page.setViewportSize({width:1540,height:1100});
    await page.locator('#file-input').setInputFiles({name:'guion.pdf',mimeType:'application/pdf',buffer:pdf}); await ready(page);
    assert.equal(await page.locator('#scene-select option').count(),6);
    assert.equal(await page.locator('.script-scene-block').count(),3,'Solo se muestran bloques de escena');
    assert.equal(await page.locator('.script-cover-card').count(),1,'Portada compactada en una tarjeta');
    assert.equal(await page.locator('.annotation-scene-group').count(),3,'Planos agrupados por escena');
    assert.equal(await page.locator('#annotation-filter').count(),0,'Sin filtro de anotaciones redundante');
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    assert.equal(await page.locator('#breadcrumb-current').textContent(),'Guion técnico / cobertura');
    assert(!(await page.locator('.sidebar').isVisible()),'Sin barra izquierda en el guion técnico');
    assert.equal(await page.locator('.editor-actions #scene-select').count(),1,'Vista del guion fija en la cabecera derecha');
    const panelBox=await page.locator('#annotations-panel').boundingBox(); const viewerBox=await page.locator('#pdf-stage').boundingBox();
    assert(panelBox.x+panelBox.width<=viewerBox.x+1,'Escenas y anotaciones a la izquierda del visor');
    assert(await page.locator('#scene-select').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Opciones de vista con texto legible');
    assert(await page.locator('.tool').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14),'Herramientas con letra más grande');
    assert.equal(await page.locator('.page-slot').count(),2,'Todas las páginas en una sola lectura');
    assert.equal(await page.locator('#previous-page, #next-page').count(),0,'Sin navegación página a página');
    assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'El scroll pertenece al visor, no a toda la interfaz');
    await page.locator('[data-tool="highlight"]').click();
    const text=page.locator('.textLayer span').filter({hasText:'abre la puerta lentamente.'}).first();
    const box=await text.boundingBox();
    await page.mouse.move(box.x+1,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:15}); await page.mouse.up();
    await page.locator('#shot-name-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#annotation-count').textContent(),'0','No guarda el resalte antes de nombrarlo');
    await page.screenshot({path:path.join(output,'nombre-plano.png'),fullPage:true});
    assert.equal(await page.locator('#shot-name-input').getAttribute('placeholder'),'1');
    await nameShot(page,'   ');
    assert.equal(await page.locator('.annotation-jump').first().textContent(),'1','Guardar vacío usa el nombre automático');
    await page.locator('.edit-annotation').first().click();
    await page.locator('#edit-shot-name').fill('Plano 01 · Entrada de Ana'); await saveEdit(page);
    await page.waitForFunction(()=>document.querySelector('#highlight-count').textContent==='1');
    assert.equal(await page.locator('.annotation-jump').first().textContent(),'Plano 01 · Entrada de Ana');
    assert.equal(await page.locator('#annotations-list textarea,#annotations-list blockquote').count(),0,'Listado sin campos de notas ni extractos repetidos');
    assert.equal(await page.locator('.document-shot-label').first().textContent(),'Plano 01 · Entrada de Ana');
    await assertLabelClearance(page);
    await page.locator('.edit-annotation').first().click();
    await page.locator('#edit-shot-dialog').waitFor({state:'visible'});
    assert((await page.locator('#edit-shot-text').textContent()).includes('abre la puerta'));
    assert(!(await page.locator('#edit-shot-text').textContent()).includes('LA PRIMERA TOMA'));
    await page.locator('#edit-shot-info').fill('Plano medio · Acercamiento a Ana');
    await chooseColor(page,'#64a7d9');
    await page.screenshot({path:path.join(output,'editar-plano.png'),fullPage:true});
    await saveEdit(page);
    assert.equal(await page.locator('.annotation-overlay rect').first().getAttribute('fill'),'#64a7d9');
    await page.locator('.locate-annotation').first().click();
    assert(!(await page.locator('#edit-shot-dialog').isVisible()),'El nombre localiza, sin abrir edición');
    await page.locator('.document-shot-label').first().click();
    assert(!(await page.locator('#edit-shot-dialog').isVisible()));
    await page.locator('.edit-annotation').first().click();
    await page.locator('#edit-shot-name').fill('Nombre sin guardar');
    await page.locator('#cancel-edit-shot').click();
    assert.equal(await page.locator('.annotation-jump').first().textContent(),'Plano 01 · Entrada de Ana');
    await page.locator('.edit-annotation').first().click();
    await page.locator('#edit-shot-name').fill('Plano 01 · Nombre actualizado'); await saveEdit(page);
    assert.equal(await page.locator('.document-shot-label').first().textContent(),'Plano 01 · Nombre actualizado');
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('.document-shot-label').first().textContent(),'Plano 01 · Entrada de Ana');
    // Escape en el formulario también descarta un resalte sin crear historial.
    await page.evaluate(()=>{
      const span=[...document.querySelectorAll('.textLayer span')].find(el=>el.textContent.includes('abre la puerta'));
      const range=document.createRange(); range.selectNodeContents(span);
      const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.locator('#apply-highlight').click(); await page.locator('#shot-name-dialog').waitFor({state:'visible'});
    await page.keyboard.press('Escape'); await page.waitForFunction(()=>!document.querySelector('.pending-annotation'));
    assert.equal(await page.locator('#annotation-count').textContent(),'1','Escape cancela un resalte nuevo');
    await page.locator('[data-tool="line"]').click();
    const crop=await page.locator('.page-window').first().boundingBox();
    await page.mouse.move(crop.x+crop.width*.85,crop.y+110); await page.mouse.down();
    await page.mouse.move(crop.x+crop.width*.87,crop.y+250,{steps:10});
    await page.keyboard.down('Shift'); await page.mouse.up(); await page.keyboard.up('Shift');
    await nameShot(page,'Plano 02 · Seguimiento');
    await page.waitForFunction(()=>document.querySelector('#line-count').textContent==='1');
    assert.equal(await page.locator('.document-shot-label').count(),2);
    await assertLabelClearance(page);
    const coords=await page.locator('.annotation-overlay line').evaluate(line=>({x1:line.getAttribute('x1'),x2:line.getAttribute('x2'),y1:line.getAttribute('y1'),y2:line.getAttribute('y2')}));
    assert.equal(coords.x1,coords.x2); assert.notEqual(coords.y1,coords.y2);
    assert.equal(await page.locator('.coverage-cap').count(),2,'Remates en ambos extremos de la línea');
    await page.locator('#undo-button').click(); assert.equal(await page.locator('#line-count').textContent(),'0');
    await page.locator('#redo-button').click(); assert.equal(await page.locator('#line-count').textContent(),'1');
    await page.locator('[data-tool="select"]').click();
    const drawnLine=await page.locator('.annotation-overlay line').boundingBox();
    await page.mouse.click(drawnLine.x,drawnLine.y+drawnLine.height/2);
    assert(!(await page.locator('#edit-shot-dialog').isVisible()),'Click en una raya selecciona su geometría');
    assert.equal(await page.locator('.line-handle-hit').count(),2,'Muestra controles en ambos extremos');
    await page.locator('.annotation-card').filter({has:page.locator('.annotation-jump').filter({hasText:'Seguimiento'})}).locator('.edit-annotation').click();
    await page.locator('#edit-shot-dialog').waitFor({state:'visible'});
    await chooseColor(page,'#c56861');
    await page.locator('#edit-shot-info').fill('Seguimiento lateral de la entrada'); await saveEdit(page);
    assert.equal(await page.locator('.annotation-overlay line').getAttribute('stroke'),'#c56861','El lápiz del panel conserva la edición de datos y color');
    // El título se mueve de forma independiente y solo se guarda en un hueco seguro.
    const title=page.locator('.document-shot-label').filter({hasText:'Seguimiento'});
    const titleBox=await title.boundingBox(); const paperBox=await page.locator('.page-window').first().boundingBox();
    const drop={x:drawnLine.x-140,y:drawnLine.y+drawnLine.height*.65};
    await page.mouse.move(titleBox.x+titleBox.width/2,titleBox.y+titleBox.height/2); await page.mouse.down();
    await page.mouse.move(drop.x,drop.y,{steps:12});
    assert.equal(await page.locator('.dragging-title').getAttribute('data-valid'),'true');
    await page.mouse.up();
    assert.equal(await title.getAttribute('data-tier'),'manual','Arrastrar almacena una posición elegida');
    const manual=(await storedNotes(page))[1].lineLabel;
    assert(manual && manual.t>=0 && manual.t<=1 && ['left','right'].includes(manual.side));
    await assertLabelClearance(page);
    const movedBox=await title.boundingBox(); const obstructed=await text.boundingBox();
    await page.mouse.move(movedBox.x+10,movedBox.y+10); await page.mouse.down();
    await page.mouse.move(obstructed.x+10,obstructed.y+10,{steps:10});
    const snapped=await page.locator('.dragging-title').boundingBox();
    assert(Math.min(Math.abs(snapped.x+snapped.width-drawnLine.x),Math.abs(snapped.x-drawnLine.x))<20,'El título sigue al lado de la línea aunque el puntero se aleje');
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.deepEqual((await storedNotes(page))[1].lineLabel,manual,'Cancelar conserva la posición ligada a la línea');
    const beforeEscape=await title.boundingBox();
    await page.mouse.move(beforeEscape.x+10,beforeEscape.y+10); await page.mouse.down();
    await page.mouse.move(beforeEscape.x+50,beforeEscape.y+65,{steps:6});
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(await page.locator('.dragging-title').count(),0,'Escape limpia la previsualización');
    assert.deepEqual((await storedNotes(page))[1].lineLabel,manual,'Escape conserva la posición anterior');
    await page.locator('#undo-button').click(); assert(!(await storedNotes(page))[1].lineLabel);
    await page.locator('#redo-button').click(); assert.deepEqual((await storedNotes(page))[1].lineLabel,manual);
    await title.click(); assert(!(await page.locator('#edit-shot-dialog').isVisible()),'Clic sigue localizando después de arrastrar');
    await page.locator('[data-tool="line"]').click();
    await page.locator('#zoom-in').click(); await ready(page);
    await assertLabelClearance(page);
    assert.equal(await title.getAttribute('data-tier'),'manual','Mantiene el destino manual al cambiar el zoom');
    assert.equal(await page.locator('.annotation-overlay line').getAttribute('x1'),coords.x1);
    await page.locator('#fit-width').click(); await ready(page);
    await page.locator('#scene-select').selectOption('scene-1', {force:true}); await ready(page);
    assert.equal(await title.getAttribute('data-tier'),'manual','Mantiene el destino manual dentro de la escena');
    const croppedHeight=await page.locator('.page-window').first().evaluate(el=>el.clientHeight);
    const fullHeight=await page.locator('.pdf-page-content').first().evaluate(el=>el.clientHeight);
    assert(croppedHeight<fullHeight*.5,'Recorta dos escenas que comparten página');
    await assertLabelClearance(page);
    await page.screenshot({path:path.join(output,'escena-anotada.png'),fullPage:true});
    await page.locator('#scene-select').selectOption('scene-2', {force:true}); await ready(page);
    assert.equal(await page.locator('.page-slot').count(),2,'Continuación de la escena visible al hacer scroll');
    assert.equal(await page.locator('#highlight-count').textContent(),'1','El panel mantiene las anotaciones de todas las escenas');
    // Una línea creada en una escena recortada conserva su coordenada original.
    const secondCrop=await page.locator('.page-window').first().boundingBox();
    await page.mouse.move(secondCrop.x+secondCrop.width*.8,secondCrop.y+30); await page.mouse.down();
    await page.mouse.move(secondCrop.x+secondCrop.width*.8,secondCrop.y+100,{steps:6}); await page.mouse.up();
    await page.locator('#shot-name-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#shot-name-input').getAttribute('placeholder'),names.nextScene('Plano 01 · Entrada de Ana'),'Otra escena toma el primer nombre anterior');
    await nameShot(page,'Plano de la calle');
    await page.waitForFunction(()=>document.querySelector('#line-count').textContent==='2');
    const sceneLineY=await page.locator('.annotation-overlay line').last().getAttribute('y1');
    assert(Number(sceneLineY)>350,'Coordenada respecto a la página completa, no al recorte');
    await page.locator('#scene-select').selectOption('all', {force:true}); await ready(page);
    assert.equal(await page.locator('.annotation-overlay line').last().getAttribute('y1'),sceneLineY);
    await page.locator('#undo-button').click();
    await page.locator('#scene-select').selectOption('scene-2', {force:true}); await ready(page);
    await page.locator('.page-slot[data-page="2"]').scrollIntoViewIfNeeded(); await pageReady(page,2);
    assert.match(await page.locator('#page-label').textContent(),/^[12] \/ 2$/,'El indicador corresponde a una de las páginas visibles');
    assert.equal(await page.locator('#annotation-count').textContent(),'2');
    await page.locator('.locate-annotation').first().click(); await ready(page);
    assert.equal(await page.locator('#scene-select').inputValue(),'all');
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    await page.locator('.edit-annotation').first().click();
    assert.equal(await page.locator('#edit-shot-info').inputValue(),'Plano medio · Acercamiento a Ana');
    await page.locator('#cancel-edit-shot').click();
    // La selección continua se reparte entre las páginas sin desplazar las marcas.
    await page.locator('.page-slot[data-page="2"]').scrollIntoViewIfNeeded(); await pageReady(page,2);
    await page.locator('[data-tool="select"]').click();
    await page.evaluate(()=>{
      const first=[...document.querySelectorAll('.page-slot[data-page="1"] .textLayer span')].filter(el=>el.textContent.trim()).at(-1);
      const second=[...document.querySelectorAll('.page-slot[data-page="2"] .textLayer span')].find(el=>el.textContent.trim());
      const range=document.createRange(); range.setStart(first.firstChild,0); range.setEnd(second.firstChild,Math.min(8,second.textContent.length));
      const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.locator('#apply-highlight').click();
    await nameShot(page,'Plano compartido entre páginas');
    assert.equal(await page.locator('#highlight-count').textContent(),'3','Resalte en cada página de la selección');
    assert.equal(await page.locator('.annotation-jump').filter({hasText:'Plano compartido entre páginas'}).count(),2,'Un solo nombre para un resalte que cruza páginas');
    assert.equal(await page.locator('.page-slot[data-page="2"] .annotation-overlay rect').count(),1);
    await page.locator('.annotation-card').filter({hasText:'Plano compartido entre páginas'}).first().locator('.edit-annotation').click();
    await page.locator('#edit-shot-name').fill('Plano compartido actualizado');
    await chooseColor(page,'#8d77cc'); await saveEdit(page);
    assert.equal(await page.locator('.annotation-jump').filter({hasText:'Plano compartido actualizado'}).count(),2);
    assert.equal(await page.locator('.document-shot-label').filter({hasText:'Plano compartido actualizado'}).count(),2);
    await assertLabelClearance(page);
    await page.locator('#undo-button').click();
    await page.locator('#undo-button').click(); assert.equal(await page.locator('#annotation-count').textContent(),'2');
    const download=page.waitForEvent('download'); await menuAction(page,'#save-backup');
    const backup=await download; const backupPath=path.join(output,'notas.json'); await backup.saveAs(backupPath);
    const saved=JSON.parse(fs.readFileSync(backupPath,'utf8')); assert.equal(saved.annotations.length,2);
    assert.equal(saved.annotations[0].shotName,'Plano 01 · Entrada de Ana');
    assert.equal(saved.annotations[1].shotName,'Plano 02 · Seguimiento');
    assert.equal(saved.annotations[1].color,'#c56861');
    assert.equal(saved.annotations[0].color,'#64a7d9');
    assert.equal(saved.annotations[0].note,'Plano medio · Acercamiento a Ana');
    const crowded={...saved,annotations:Array.from({length:18},(_,i)=>({...saved.annotations[0],id:`crowded-${i}`,shotId:`crowded-${i}`,shotName:`Plano ${i+10} · Un nombre largo que identifica una cobertura diferente de esta misma acción del guion`}))};
    await page.locator('#backup-input').setInputFiles({name:'cobertura-densa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(crowded))});
    await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='20');
    await assertLabelClearance(page);
    assert((await page.locator('.document-shot-label[data-placement="overflow"]').count())>0,'Reserva una zona aparte si se agota el encabezado');
    const row=await page.locator('.overflow-title-items').first().locator('.document-shot-tag').evaluateAll(labels=>labels.slice(0,2).map(el=>({x:el.offsetLeft,y:el.offsetTop})));
    assert.equal(row[0].y,row[1].y); assert(row[1].x>row[0].x,'Títulos alineados uno al lado del otro');
    await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:path.join(output,'nombres-sin-solapamientos.png'),fullPage:true});
    await page.locator('#undo-button').click();
    assert.equal(await page.locator('#annotation-count').textContent(),'2');
    await page.locator('.delete-annotation').last().click(); assert.equal(await page.locator('#annotation-count').textContent(),'1');
    await page.locator('#backup-input').setInputFiles(backupPath);
    await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='2');
    await page.locator('#backup-input').setInputFiles(backupPath);
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('0 anotaciones importadas'));
    const invalid={...saved,fingerprint:'otro-pdf'};
    await page.locator('#backup-input').setInputFiles({name:'otro.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('no corresponden'));
    assert.equal(await page.locator('#annotation-count').textContent(),'2');
    const legacy={...saved,annotations:[{...saved.annotations[0],id:'legacy-note-without-name'}]}; delete legacy.annotations[0].shotName;
    await page.locator('#backup-input').setInputFiles({name:'notas-antiguas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
    await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='3');
    assert((await page.locator('.annotation-card[data-id="legacy-note-without-name"] .annotation-jump').textContent()).includes('Resalte'),'Compatibilidad con anotaciones antiguas sin nombre');
    await page.locator('#undo-button').click();
    await page.reload(); await page.locator('#file-input').setInputFiles({name:'renombrado.pdf',mimeType:'application/pdf',buffer:pdf}); await ready(page);
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    assert.equal(await page.locator('#annotation-count').textContent(),'2','Recuperación al reabrir el mismo PDF');
    assert.equal(await page.locator('.annotation-jump').first().textContent(),'Plano 01 · Entrada de Ana','Recupera el nombre guardado');
    assert.deepEqual((await storedNotes(page))[1].lineLabel,manual,'Recupera la posición del título al reabrir e importar');
    // Cada página tiene su propia selección y capa de dibujo, también fuera de la primera.
    await page.locator('.page-slot[data-page="2"]').scrollIntoViewIfNeeded(); await pageReady(page,2);
    await page.locator('[data-tool="line"]').click();
    const secondPage=await page.locator('.page-slot[data-page="2"] .page-window').boundingBox();
    const stageBox=await page.locator('#pdf-stage').boundingBox();
    const lineTop=Math.max(stageBox.y+50,secondPage.y+80);
    await page.mouse.move(secondPage.x+secondPage.width*.8,lineTop); await page.mouse.down();
    await page.mouse.move(secondPage.x+secondPage.width*.8,lineTop+80,{steps:6}); await page.mouse.up();
    await nameShot(page,'Plano 03 · Ventanilla');
    await page.waitForFunction(()=>document.querySelector('#line-count').textContent==='2');
    assert.equal(await page.locator('.page-slot[data-page="2"] .annotation-overlay line').count(),1);
    await page.locator('#zoom-in').click(); await ready(page); await pageReady(page,2);
    assert.equal(await page.locator('.page-slot[data-page="2"] .annotation-overlay line').count(),1);
    await page.locator('#undo-button').click();
    // Cancelar una línea no crea marcas ni altera el historial de trabajo guardado.
    const currentPaper=await page.locator('.page-slot[data-page="2"] .page-window').boundingBox();
    const visibleStage=await page.locator('#pdf-stage').boundingBox(); const cancelY=Math.max(currentPaper.y+100,visibleStage.y+60);
    await page.mouse.move(currentPaper.x+currentPaper.width*.7,cancelY); await page.mouse.down();
    await page.mouse.move(currentPaper.x+currentPaper.width*.7,cancelY+70,{steps:5}); await page.mouse.up();
    await page.locator('#shot-name-dialog').waitFor({state:'visible'});
    await page.locator('#cancel-shot-name').click();
    await page.waitForFunction(()=>!document.querySelector('.pending-annotation'));
    assert.equal(await page.locator('#annotation-count').textContent(),'2');
    assert.equal(await page.locator('.page-slot[data-page="2"] .annotation-overlay line').count(),0);
    await page.locator('#fit-width').click(); await ready(page);
    await page.locator('[data-tool="select"]').click();
    await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=0); await pageReady(page,1);
    await page.screenshot({path:path.join(output,'editor-escritorio.png'),fullPage:true});
    for(const width of [390,768,1024]) {
      await page.setViewportSize({width,height:900}); await page.locator('#fit-width').click(); await ready(page);
      await assertLabelClearance(page);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Sin desbordamiento a ${width}px`);
      assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),`Scroll interno del visor a ${width}px`);
      if(width===390) {
        assert(!(await page.locator('#annotations-panel').isVisible()),'Panel móvil cerrado por defecto');
        await page.locator('#toggle-annotations').click();
        assert(await page.locator('#annotations-panel').isVisible());
        const mobilePanel=await page.locator('#annotations-panel').boundingBox(); assert.equal(mobilePanel.x,0);
        await page.locator('#panel-backdrop').click({position:{x:385,y:100}});
        assert(!(await page.locator('#annotations-panel').isVisible()));
      }
      if(width===390) await page.screenshot({path:path.join(output,'editor-movil.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:900}); await page.locator('#fit-width').click(); await ready(page); await pageReady(page,1);
    await page.evaluate(()=>{
      const span=[...document.querySelectorAll('.textLayer span')].find(el=>el.textContent.includes('abre la puerta'));
      const range=document.createRange(); range.selectNodeContents(span);
      const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await page.locator('#apply-highlight').click(); await page.locator('#shot-name-dialog').waitFor({state:'visible'});
    assert(await page.locator('#shot-name-dialog').evaluate(el=>el.getBoundingClientRect().width<innerWidth),'Formulario adaptado al móvil');
    await page.screenshot({path:path.join(output,'nombre-plano-movil.png'),fullPage:true});
    await page.locator('#shot-name-input').fill('Plano móvil'); await page.locator('#shot-name-input').press('Enter');
    await page.waitForFunction(()=>document.querySelector('#annotation-count').textContent==='3' && !document.querySelector('#shot-name-dialog').open);
    await page.locator('#undo-button').click(); assert.equal(await page.locator('#annotation-count').textContent(),'2');
    await page.setViewportSize({width:1024,height:900}); await page.locator('#fit-width').click(); await ready(page);
    await page.locator('#file-input').setInputFiles({name:'invalido.pdf',mimeType:'application/pdf',buffer:Buffer.from('texto')});
    await page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('no parece'));
    assert.equal(await page.locator('#annotation-count').textContent(),'2','Archivo inválido conserva trabajo');
    await page.locator('#file-input').setInputFiles({name:'escaneado.pdf',mimeType:'application/pdf',buffer:scanned});
    await page.locator('.no-scenes-view').waitFor();
    assert(await page.evaluate(()=>state.rendered&&!state.busy),'Un PDF sin escenas termina la carga y permite cambiar de vista');
    assert((await page.locator('#page-label').getAttribute('aria-label')).includes('sin escenas detectadas'));
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    assert.equal(await page.locator('#scene-select option').count(),3);
    assert.equal(await page.locator('.reader-help,#scene-notice,#tool-help').count(),0,'Se retiró el bloque Ayuda del visor');
    assert.equal(await page.locator('#annotation-count').textContent(),'0','Otro PDF no recibe notas anteriores');
    await page.locator('[data-tool="line"]').click();
    const scanPaper=await page.locator('.page-window').first().boundingBox();
    await page.mouse.move(scanPaper.x+scanPaper.width*.8,scanPaper.y+80); await page.mouse.down();
    await page.mouse.move(scanPaper.x+scanPaper.width*.8,scanPaper.y+150,{steps:5}); await page.mouse.up();
    await nameShot(page,'Plano sobre guion escaneado');
    assert.notEqual(await page.locator('.document-shot-label').getAttribute('data-placement'),'margin','Mantiene el título ligado al trazo o en la zona auxiliar si no hay hueco');
    await assertLabelClearance(page);
    const longDoc=await PDFDocument.create(); const longFont=await longDoc.embedFont(StandardFonts.Courier);
    for(let index=1;index<=16;index++) {
      const sheet=longDoc.addPage([595,842]);
      sheet.drawText(`INT. LOCALIZACION ${index} - DIA`,{x:65,y:770,size:12,font:longFont});
    }
    await page.setViewportSize({width:1540,height:1100});
    await page.locator('#file-input').setInputFiles({name:'guion-largo.pdf',mimeType:'application/pdf',buffer:Buffer.from(await longDoc.save())}); await ready(page);
    assert.equal(await page.locator('.script-scene-block[data-scene^="scene-"]').count(),16);
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    assert.equal(await page.locator('.page-slot').count(),16);
    assert.equal(await page.locator('.page-slot[data-page="16"] canvas').count(),0,'No dibuja todo el documento de golpe');
    for(const number of [4,7,10,13,16]) { await page.locator(`.page-slot[data-page="${number}"]`).scrollIntoViewIfNeeded(); await pageReady(page,number); }
    assert((await page.locator('.page-slot[data-ready="true"]').count())<=8,'Libera páginas lejanas para limitar memoria');
    assert.equal(await page.locator('.page-slot[data-page="1"] canvas').count(),0);
    await page.locator('.page-slot[data-page="1"]').scrollIntoViewIfNeeded(); await pageReady(page,1);
    assert.equal(await page.locator('.page-slot[data-page="1"] canvas').count(),1,'Vuelve a dibujar al regresar');
    await menuAction(page,'#remove-button'); assert(await page.locator('#upload-view').isVisible());
    assert(await page.locator('.sidebar').isVisible(),'La portada mantiene su barra lateral');
    // Nombres consecutivos reales en una sesión nueva, sin depender de notas anteriores.
    const numbering=await browser.newPage({viewport:{width:1540,height:1100}});
    numbering.on('pageerror',error=>errors.push(error.message));
    await numbering.goto(base); await numbering.locator('#file-input').setInputFiles({name:'secuencias.pdf',mimeType:'application/pdf',buffer:pdf}); await ready(numbering);
    const caps=await numbering.evaluate(()=>PlanoDocumentLabels.capSegments({start:{x:.2,y:.3},end:{x:.8,y:.4}},{width:600,height:900}));
    for(const cap of caps) {
      const dx=cap.end.x-cap.start.x,dy=cap.end.y-cap.start.y;
      assert(Math.abs(dx*360+dy*90)<1e-8,'Remates perpendiculares también en líneas diagonales');
      assert(Math.abs(Math.hypot(dx,dy)-12)<1e-8,'Remates de tamaño legible independiente del zoom');
    }
    async function numberShot(scene, chosen, expected, upward=false) {
      await numbering.locator('#scene-select').selectOption(scene, {force:true}); await ready(numbering);
      await numbering.locator('button[data-tool="line"]').click();
      const paper=await numbering.locator('.page-window').first().boundingBox();
      await numbering.mouse.move(paper.x+paper.width*.90,paper.y+(upward?105:50)); await numbering.mouse.down();
      await numbering.mouse.move(paper.x+paper.width*.90,paper.y+(upward?50:105),{steps:5}); await numbering.mouse.up();
      await numbering.locator('#shot-name-dialog').waitFor({state:'visible'});
      assert.equal(await numbering.locator('#shot-name-input').getAttribute('placeholder'),expected);
      await nameShot(numbering,chosen);
    }
    await numberShot('scene-1','PA','1',true);
    const reverseLine=await numbering.locator('.annotation-overlay line').boundingBox();
    const reverseTitle=await numbering.locator('.document-shot-label').boundingBox();
    assert(Math.abs(reverseTitle.y+reverseTitle.height/2-reverseLine.y-reverseLine.height)<2,'Título al inicio real de un trazo ascendente');
    await numberShot('scene-1','','PB'); await numberShot('scene-1','','PC');
    await numberShot('scene-1','P1','PD'); await numberShot('scene-1','','P2');
    await numberShot('scene-1','1A','P3'); await numberShot('scene-1','','1B');
    await numberShot('scene-2','','PB'); await numberShot('scene-2','','PC');
    await numberShot('scene-3','','PC');
    assert.deepEqual((await storedNotes(numbering)).map(item=>item.shotName),['PA','PB','PC','P1','P2','1A','1B','PB','PC','PC']);
    await numbering.close();
    assert.deepEqual(errors,[]);
    console.log('OK: remates de línea, prioridades de colocación, títulos junto a la escena, secuencias Excel, nombre automático, arrastre sin colisiones, Escape, persistencia/zoom/escenas/historial/copias, edición y responsive.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
