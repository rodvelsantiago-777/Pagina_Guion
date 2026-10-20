/* Casos de encabezado con números a ambos lados y escenas que comparten página. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const load = name => require(process.env.PLANO_RUNTIME_MODULES ? path.join(process.env.PLANO_RUNTIME_MODULES,name) : name);
const {chromium} = load('playwright');
const {PDFDocument,StandardFonts} = load('pdf-lib');
const scenes = require('../scene-analysis.js');
const output = path.join(__dirname,'.output');
fs.mkdirSync(output,{recursive:true});
async function ready(page) {
  await page.waitForFunction(()=>document.querySelector('#render-status').hidden && document.querySelector('.page-slot[data-ready="true"] .textLayer') && document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');
}
async function nameShot(page,name) {
  await page.locator('#shot-name-dialog').waitFor({state:'visible'});
  await page.locator('#shot-name-input').fill(name);
  await page.locator('#shot-name-input').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#shot-name-dialog').open && !document.querySelector('.pending-annotation'));
}
async function highlight(page,word,line) {
  await page.evaluate(({word,line})=>{
    const span=[...document.querySelectorAll('.textLayer span')].find(el=>el.textContent.includes(word) && line.includes(el.textContent.trim()));
    if (!span) throw Error('Falta el texto visible del recorte');
    const start=span.textContent.indexOf(word),range=document.createRange();
    range.setStart(span.firstChild,start); range.setEnd(span.firstChild,start+word.length);
    getSelection().removeAllRanges(); getSelection().addRange(range);
  },{word,line});
  await page.locator('#apply-highlight').click();
}
(async()=>{
  const geometry=scenes.detectScenes([{lines:[{text:'1 INT. CASA - DIA 1',x:.03,width:.9,y:.1,height:.02,parts:[{text:'1',x:.03,width:.02},{text:'INT. CASA - DIA',x:.12,width:.5},{text:'1',x:.93,width:.02}]}]}]);
  assert.equal(geometry[0].heading.x,.12);
  assert.equal(geometry[0].heading.width,.5);
  assert.equal(geometry[0].heading.rightLimit,.93,'El número derecho limita el hueco y no es parte del título');
  const split=scenes.segmentsForView([{...geometry[0],end:{page:1,y:.6}},{id:'scene-2',start:{page:1,y:.6},end:{page:1,y:1}}],1,'all');
  assert.equal(split.length,2); assert.equal(new Set(split.map(s=>s.id)).size,2);
  assert.equal(split[0].top,.095); assert.equal(split[0].bottom,split[1].top); assert.equal(split[1].bottom,1,'La vista de trabajo excluye el contenido anterior a las escenas');

  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),bold=await pdf.embedFont(StandardFonts.CourierBold);
  const sheet=pdf.addPage([595,842]);
  const text=(value,x,y,strong=false)=>sheet.drawText(value,{x,y,size:12,font:strong?bold:font});
  const heading='INT. CASA DE JUAN PABLO, HABITACION - NOCHE';
  text('1',25,770); text(heading,70,770,true); text('1',560,770);
  const lines=[
    'Una ventana deja entrar la luz tenue de la calle.',
    'JUAN PABLO permanece sentado junto a la cama.',
    'Una pequeña habitación a oscuras. El lugar luce descuidado.',
    'Hay ropa tirada por el suelo y un escritorio lleno de cosas.',
    'Su madre contempla una foto enmarcada junto a la puerta.'
  ];
  lines.forEach((line,index)=>text(line,65,742-index*16));
  text('2',25,400); text('EXT. CALLE - NOCHE',70,400,true); text('2',560,400);
  text('La calle permanece vacía.',65,368); text('Una luz parpadea al fondo.',65,352);
  const buffer=Buffer.from(await pdf.save()); fs.writeFileSync(path.join(output,'escenas-misma-pagina.pdf'),buffer);
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PLANO_TEST_URL || pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.locator('#file-input').setInputFiles({name:'escenas.pdf',mimeType:'application/pdf',buffer}); await ready(page);
    assert.equal(await page.locator('.script-scene-block[data-scene^="scene-"]').count(),2);
    assert.equal(await page.locator('.page-slot[data-page="1"]').count(),2,'Solo los dos recortes de escena de la página');
    assert.equal(await page.locator('#annotation-filter').count(),0);
    assert.equal(await page.locator('.annotation-scene-group').count(),2);
    const block1=page.locator('.script-scene-block[data-scene="scene-1"]'),block2=page.locator('.script-scene-block[data-scene="scene-2"]');
    const first=await block1.boundingBox(),second=await block2.boundingBox();
    assert(second.y-first.y-first.height>=40,'Hay un espacio visible entre las escenas');
    await page.locator('#scene-select').selectOption('scene-1', {force:true}); await ready(page);
    assert.equal(await page.locator('.textLayer span').filter({hasText:'calle permanece'}).count(),0,'El texto de otra escena no participa en la selección');
    await highlight(page,'habitación',lines[2]); await nameShot(page,'P1');
    await highlight(page,'escritorio',lines[3]); await nameShot(page,'P2');
    assert.equal(await page.locator('.document-shot-label[data-tier="heading"]').count(),2,JSON.stringify(await page.locator('.document-shot-label').evaluateAll(labels=>labels.map(el=>({name:el.textContent,tier:el.dataset.tier})))));
    const headingTail='CASA DE JUAN PABLO, HABITACION - NOCHE';
    const headingBox=await page.locator('.textLayer span').filter({hasText:headingTail}).boundingBox();
    const right=await page.locator('.textLayer span').filter({hasText:/^1$/}).evaluateAll(spans=>Math.max(...spans.map(span=>span.getBoundingClientRect().left)));
    const labelBoxes=await page.locator('.document-shot-label').evaluateAll(labels=>labels.map(label=>{const r=label.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    for(const box of labelBoxes) {
      assert(box.x>headingBox.x+headingBox.width+3,'Está después del texto, nunca junto al número izquierdo');
      assert(box.x+box.width<right-3,'Está antes del número del margen derecho');
      assert(Math.abs(box.y+box.height/2-headingBox.y-headingBox.height/2)<5,'Comparte la fila del encabezado');
    }
    assert.equal(labelBoxes[0].y,labelBoxes[1].y); assert(labelBoxes[1].x>labelBoxes[0].x+labelBoxes[0].width+5);
    assert.equal(await page.locator('.scene-title-marker').count(),0,'No añade indicadores junto a números');
    assert.equal(await page.locator('.annotation-scene-group[data-scene="scene-1"] .annotation-card').count(),2);
    await page.screenshot({path:path.join(output,'encabezado-correcto.png'),fullPage:true});
    await page.locator('#scene-select').selectOption('scene-2', {force:true}); await ready(page);
    assert.equal(await page.locator('.annotation-scene-group[data-scene="scene-1"] .annotation-card').count(),2,'Los planos de la primera escena siguen en el panel');
    await page.locator('button[data-tool="line"]').click();
    const paper=await page.locator('.page-window').boundingBox();
    await page.mouse.move(paper.x+paper.width*.90,paper.y+50); await page.mouse.down();
    await page.mouse.move(paper.x+paper.width*.90,paper.y+120,{steps:5}); await page.mouse.up();
    await nameShot(page,'2A');
    assert.equal(await page.locator('.annotation-scene-group[data-scene="scene-2"] .annotation-card').count(),1);
    assert.equal(await page.locator('#annotation-count').textContent(),'3');
    const lineCoordinates=await page.locator('.annotation-overlay line').evaluate(line=>[line.getAttribute('x1'),line.getAttribute('y1'),line.getAttribute('x2'),line.getAttribute('y2')]);
    await page.locator('button[data-tool="select"]').click();
    const movable=page.locator('.document-shot-label').filter({hasText:'2A'}),before=await movable.boundingBox();
    await page.mouse.move(before.x+10,before.y+10); await page.mouse.down();
    const freshPaper=await page.locator('.page-window').boundingBox();
    await page.mouse.move(freshPaper.x+freshPaper.width*.7,freshPaper.y+freshPaper.height*.5,{steps:10});
    assert.equal(await page.locator('.dragging-title').getAttribute('data-valid'),'true');
    await page.mouse.up();
    assert.equal(await movable.getAttribute('data-tier'),'manual','Mueve un título dentro de un recorte de escena');
    await page.locator('#scene-select').selectOption('print', {force:true}); await ready(page);
    assert.equal(await page.locator('.page-slot').count(),1,'Edición conserva una página original sin cortes');
    assert.equal(await page.locator('.script-scene-block').count(),0);
    assert.equal(await page.locator('.textLayer span').filter({hasText:headingTail}).count(),1);
    assert.equal(await page.locator('.annotation-overlay rect').count(),2);
    assert.equal(await movable.getAttribute('data-tier'),'manual','La posición elegida sigue en la página original');
    assert.deepEqual(await page.locator('.annotation-overlay line').evaluate(line=>[line.getAttribute('x1'),line.getAttribute('y1'),line.getAttribute('x2'),line.getAttribute('y2')]),lineCoordinates);
    await page.locator('#scene-select').selectOption('all', {force:true}); await ready(page);
    await page.locator('.script-scene-block[data-scene="scene-1"]').scrollIntoViewIfNeeded();
    await page.locator('.page-slot[data-scene="scene-1"][data-ready="true"]').waitFor();
    assert.equal(await page.locator('.document-shot-label').filter({hasText:/^P[12]$/}).count(),2,'No pierde ni duplica títulos al volver al guion dividido');
    assert.equal(await movable.getAttribute('data-tier'),'manual','La posición elegida sigue en el segundo recorte de la misma página');
    await page.screenshot({path:path.join(output,'guion-separado-escenas.png'),fullPage:true});
    await page.locator('.annotation-card').filter({has:page.locator('.annotation-jump').filter({hasText:'2A'})}).locator('.locate-annotation').click();
    assert.equal(await page.locator('#scene-select').inputValue(),'all','Localiza una marca en la escena correcta sin cambiar la vista completa');
    const stage=await page.locator('#pdf-stage').boundingBox(),located=await page.locator('.page-slot[data-scene="scene-2"] .annotation-overlay line').boundingBox();
    assert(located.y>=stage.y-5 && located.y<stage.y+stage.height,'Encuentra el segundo recorte de una misma página');
    await page.setViewportSize({width:390,height:900}); await page.locator('#fit-width').click(); await ready(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Guion dividido sin desbordar la pantalla móvil');
    await page.locator('#toggle-annotations').click();
    assert(await page.locator('#annotations-panel').isVisible());
    assert.equal(await page.locator('.annotation-scene-group').count(),2,'Móvil conserva las divisiones y todos los planos');
    await page.screenshot({path:path.join(output,'escenas-movil.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('OK: hueco entre encabezado y número derecho, títulos alineados, panel por escenas sin filtro, guion dividido, edición original, selección y navegación entre recortes de la misma página.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
