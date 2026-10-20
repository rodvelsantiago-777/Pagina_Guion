/* Títulos en márgenes de escenas, fijación, controles compactos y cabecera opaca. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});}
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier),sheet=pdf.addPage([595,842]);
 sheet.drawText('Texto anterior a la escena que debe permanecer oculto.',{x:65,y:800,size:12,font});
 sheet.drawText('INT. ESTUDIO - DIA',{x:65,y:770,size:12,font});
 for(let y=720;y>=500;y-=14)sheet.drawText('Ana prepara la camara. Todo esta listo para el rodaje. '.repeat(2).slice(0,80),{x:5,y,size:12,font});
 const buffer=Buffer.from(await pdf.save()),browser=await chromium.launch({channel:'msedge',headless:true});
 try{
   const context=await browser.newContext({viewport:{width:1540,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);await page.locator('#file-input').setInputFiles({name:'margenes.pdf',mimeType:'application/pdf',buffer});await ready(page);
   const fingerprint=await page.evaluate(()=>state.fingerprint),record={id:'H',shotId:'H',shotName:'P1',type:'highlight',page:1,color:'#e8b83f',text:'Ana prepara la camara.',rects:[{x:.02,y:.2,width:.96,height:.02}],description:'Descripción larga del plano para comprobar que la tarjeta conserva un resumen compacto de dos líneas y que se puede consultar todo en la ficha.',note:'Una nota',createdAt:'2026-10-20T12:00:00Z'};
   async function importRecords(records){await page.locator('#backup-input').setInputFiles({name:'planos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:records}))});await page.waitForFunction(count=>state.annotations.length===count,records.length);}
   await importRecords([record]);await ready(page);
   const tag=page.locator('.document-shot-tag[data-annotation-id="H"]'),label=tag.locator('button');
   assert.equal(await tag.getAttribute('data-tier'),'heading','El caso reproduce un título colocado junto al encabezado');
   const panel=await page.locator('#annotations-panel').boundingBox(),toggle=await page.locator('#toggle-annotations').boundingBox(),view=await page.locator('.view-mode-control').boundingBox();
   assert(toggle.x<panel.width&&view.x>1000,'Panel a la izquierda y vista a la derecha');
   await page.locator('#toggle-annotations').click();await page.waitForTimeout(250);await ready(page);assert(!(await page.locator('#annotations-panel').isVisible()));assert(await page.locator('#view-mode-button').isVisible(),'La vista sigue disponible sin panel');await page.locator('#toggle-annotations').click();await page.waitForTimeout(250);await ready(page);
   assert((await page.locator('.annotation-card').boundingBox()).height<150,'Las tarjetas largas dejan ver más planos');
   await tag.scrollIntoViewIfNeeded();
   let paper=await page.locator('.scene-paper').first().boundingBox(),original=await tag.boundingBox();
   const destination={x:paper.x+paper.width*.2,y:paper.y+6+original.height/2};
   await drag(page,center(original),destination);assert.equal(await page.locator('.dragging-title').getAttribute('data-valid'),'true','El margen superior es válido aunque antes del recorte haya texto oculto');await page.mouse.up();
   const position=await page.evaluate(()=>state.annotations[0].labelPosition),segmentTop=await page.evaluate(()=>state.segments[0].top);
   assert(position&&position.y<segmentTop,'La posición manual ocupa el margen visual de la escena');
   let moved=await tag.boundingBox();assert(Math.abs(moved.x-original.x)>40&&Math.abs(moved.y-original.y)>15,'Arrastre libre en ambos ejes desde el encabezado');
   await label.focus();await page.keyboard.press('Shift+F10');assert(await page.locator('#title-position-menu').isVisible());await page.keyboard.press('Escape');
   await label.click({button:'right'});assert(await page.locator('#title-position-menu').isVisible());assert.equal(await page.locator('#toggle-title-pin').textContent(),'Fijar posición');await page.locator('#toggle-title-pin').click();
   assert.equal(await tag.getAttribute('data-pinned'),'true');const fixed=await page.evaluate(()=>JSON.stringify(state.annotations[0].labelPosition));
   await drag(page,center(await tag.boundingBox()),{x:paper.x+paper.width*.6,y:paper.y+15});assert.equal(await page.locator('.dragging-title').count(),0);await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(state.annotations[0].labelPosition)),fixed,'Un título fijado no se arrastra');
   await label.click({button:'right'});assert.equal(await page.locator('#toggle-title-pin').textContent(),'Liberar posición');await page.locator('#toggle-title-pin').click();assert.equal(await tag.getAttribute('data-pinned'),'false');
   await page.locator('#undo-button').click();assert.equal(await tag.getAttribute('data-pinned'),'true');await page.locator('#redo-button').click();assert.equal(await tag.getAttribute('data-pinned'),'false');
   paper=await page.locator('.scene-paper').first().boundingBox();
   const target={x:paper.x+paper.width*.75,y:paper.y+paper.height-6-(await tag.boundingBox()).height/2};
   await drag(page,center(await tag.boundingBox()),target);assert.equal(await page.locator('.dragging-title').getAttribute('data-valid'),'true');await page.mouse.up();assert.notEqual(await page.evaluate(()=>JSON.stringify(state.annotations[0].labelPosition)),fixed,'Liberar devuelve el arrastre libre');
   await label.click({button:'right'});await page.locator('#toggle-title-pin').click();const saved=await page.evaluate(()=>JSON.stringify(state.annotations));
   await page.reload();await page.locator('#file-input').setInputFiles({name:'margenes.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.deepEqual(await page.evaluate(()=>state.annotations),JSON.parse(saved),'Posición y fijación se recuperan del guardado');
   assert(await page.evaluate(()=>validateNotes(state.annotations)[0].labelPinned),'El formato JSON admite la fijación');
   await page.screenshot({path:path.join(output,'titulos-margenes-fijados.png'),fullPage:true});
   await page.locator('[data-color-target="annotation-color"]').click();let popup=await page.locator('#color-picker-dialog').boundingBox();assert(popup.width<=281&&popup.height<120,'Paleta de anotaciones pequeña y anclada');
   await page.screenshot({path:path.join(output,'paleta-compacta.png'),fullPage:true});await page.locator('#choose-custom-color').click();popup=await page.locator('#color-picker-dialog').boundingBox();assert(popup.width<=333&&popup.height<420,'RGB/HEX en un editor compacto');await page.keyboard.press('Escape');assert(!(await page.locator('#color-picker-dialog').isVisible()));
   await page.locator('#stage-tabs [data-stage="technical"]').click();
   const extra=Array.from({length:70},(_,i)=>({...record,id:'T'+i,shotId:'T'+i,shotName:'T'+i,type:'line',start:{x:.9,y:.15},end:{x:.9,y:.3},shotOrder:i}));
   await importRecords([...JSON.parse(saved),...extra]);
   await page.locator('#toggle-theme').click();await page.locator('.technical-table-scroll').evaluate(el=>el.scrollTop=510);
   const scroll=await page.locator('.technical-table-scroll').boundingBox(),head=await page.locator('#technical-table thead').boundingBox();assert(Math.abs(head.y-scroll.y)<2,'La cabecera ocupa el borde superior del área desplazable');
   assert(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('thead'),{x:scroll.x+80,y:scroll.y+3}),'No aparecen filas recortadas por encima de los títulos');
   assert.equal(await page.locator('#technical-table thead').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#technical-table thead th').first().evaluate(el=>getComputedStyle(el).backgroundColor));
   await page.screenshot({path:path.join(output,'tabla-cabecera-opaca.png'),fullPage:true});
   await page.setViewportSize({width:390,height:850});await page.locator('#stage-tabs [data-stage="coverage"]').click();await ready(page);await page.locator('#open-appearance').click();await page.screenshot({path:path.join(output,'temas-menu-movil.png'),fullPage:true});await page.keyboard.press('Escape');
   await page.locator('[data-color-target="annotation-color"]').click();await page.locator('#choose-custom-color').click();const mobile=await page.locator('#color-picker-dialog').boundingBox();assert(mobile.x>=0&&mobile.x+mobile.width<=390&&mobile.y>=0&&mobile.y+mobile.height<=850);await page.screenshot({path:path.join(output,'color-menu-movil.png'),fullPage:true});
   assert.deepEqual(errors,[]);console.log('OK: arrastre desde encabezados a márgenes sin texto oculto, fijar/liberar con clic derecho, historial/guardado/JSON, controles reubicados, tarjetas compactas, paletas pequeñas y cabecera fija opaca al desplazar.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
