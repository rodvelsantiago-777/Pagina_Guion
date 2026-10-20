/* Orden de planos, corrección de resaltes, rótulos ligados y paleta de colores. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const layout=require('../label-layout.js'),output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('plano-notes-v1:')))));}
async function notes(page){return (await stored(page)).annotations;}
async function name(page,name){await page.locator('#shot-name-dialog').waitFor({state:'visible'});await page.locator('#shot-name-input').fill(name);await page.locator('#shot-name-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#shot-name-dialog').open&&!document.querySelector('.pending-annotation'));}
async function drag(page,a,b){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}
const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
async function selectText(page,text){
  await page.evaluate(text=>{
    const layer=document.querySelector('.page-slot[data-page="1"] .textLayer'),walker=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT),nodes=[];let node,full='';
    while(node=walker.nextNode()){nodes.push({node,start:full.length,end:full.length+node.textContent.length});full+=node.textContent;}
    const start=full.indexOf(text);if(start<0)throw new Error('Texto no encontrado: '+text);
    const end=start+text.length,a=nodes.find(n=>n.end>start),b=nodes.find(n=>n.end>=end);
    const range=document.createRange();range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);getSelection().removeAllRanges();getSelection().addRange(range);
  },text);
}
async function line(page,shotName,x,y1,y2){
  await page.locator('button[data-tool="line"]').click();const r=await page.locator('.page-window').first().boundingBox();
  await drag(page,{x:r.x+r.width*x,y:r.y+r.height*y1},{x:r.x+r.width*x,y:r.y+r.height*y2});await nameShot(shotName);
  async function nameShot(value){await name(page,value);await page.locator('button[data-tool="select"]').click();}
}
async function importNotes(page,annotations){const saved=await stored(page);await page.locator('#backup-input').setInputFiles({name:'interacciones.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint:saved.fingerprint,annotations}))});}
async function palette(page){await page.locator('[data-color-target="annotation-color"]').click();await page.locator('#color-picker-dialog').waitFor({state:'visible'});}
async function custom(page,color){await page.locator('#choose-custom-color').click();await page.locator('#custom-color-hex').fill(color);await page.locator('#save-custom-color').click();}
async function correct(page,id){
  await page.locator(`.annotation-card[data-id="${id}"] .locate-annotation`).click();
  const rect=await page.locator(`g[data-annotation-id="${id}"] rect`).first().boundingBox();await page.mouse.click(...Object.values(center(rect)));
  await page.locator('#highlight-action').waitFor({state:'visible'});assert(!(await page.locator('#shot-details-dialog').isVisible()));
  await page.locator('#correct-highlight').click();await page.locator('#highlight-correction-bar').waitFor({state:'visible'});
}
(async()=>{
  const descriptor={id:'L',type:'line',width:35,height:25,line:{start:{x:250,y:80},end:{x:250,y:280}},anchor:{x:250,y:80,width:0,height:0}};
  const preferred=layout.lineLabelRect(descriptor,.5,'right');
  const highlight={id:'H',type:'highlight',width:35,height:25,manual:{x:preferred.x,y:preferred.y},anchor:{x:100,y:170,width:80,height:15}};
  const placed=layout.placeLabels({width:500,top:0,bottom:500,labels:[highlight,descriptor],shapes:[{type:'line',...descriptor.line}]});
  assert.equal(placed[0].id,'L','Los títulos de línea se colocan antes de los resaltes');
  const snapped=layout.constrainedLineLabel(descriptor,{x:-1000,y:900});assert.equal(snapped.lineT,1);assert.equal(snapped.lineSide,'left');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
  const sheet=pdf.addPage([595,842]);for(const [text,y] of [['INT. CASA - DIA',770],['Ana abre la puerta.',700],['Una luz ilumina la mesa.',650],['Ana encuentra una carta.',600],['EXT. CALLE - NOCHE',400],['La calle permanece vacia.',350]])sheet.drawText(text,{x:65,y,size:12,font});
  const second=pdf.addPage([595,842]);second.drawText('Ana sale y cierra la puerta.',{x:65,y:730,size:12,font});
  const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1540,height:1100}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const base=process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
    await page.goto(base);await page.locator('#file-input').setInputFiles({name:'interacciones.pdf',mimeType:'application/pdf',buffer});await ready(page);
    await page.locator('#scene-select').selectOption('print', {force:true});await ready(page);
    await selectText(page,'Ana abre la puerta.');await page.locator('#apply-highlight').click();await name(page,'H1');
    await page.locator('button[data-tool="select"]').click();
    const h=(await notes(page))[0],title=page.locator(`.document-shot-tag[data-annotation-id="${h.id}"]`);
    const freePaper=await page.locator('.page-window').first().boundingBox(),originalTitle=await title.boundingBox();
    await drag(page,center(originalTitle),{x:freePaper.x+freePaper.width*.65,y:freePaper.y+freePaper.height*.36});
    const free=(await notes(page)).find(item=>item.id===h.id);assert(free.labelPosition&&!free.lineLabel,'El título de un resalte se mueve libremente en ambas direcciones');
    assert(Math.abs((await title.boundingBox()).x-originalTitle.x)>30&&Math.abs((await title.boundingBox()).y-originalTitle.y)>30);
    const before=await title.boundingBox();
    const paper=await page.locator('.page-window').first().boundingBox(),p=center(before);
    await line(page,'M1',(p.x-paper.x)/paper.width,(p.y-paper.y-25)/paper.height,(p.y-paper.y+70)/paper.height);
    const moved=await title.boundingBox();assert(Math.abs(moved.x-before.x)>2||Math.abs(moved.y-before.y)>2,'Una línea nueva desplaza el nombre del resalte que ocupa su espacio');
    const m=(await notes(page)).find(item=>item.shotName==='M1');assert(Math.abs(m.start.x-(p.x-paper.x)/paper.width)<.001,'El trazo no se desplaza para esquivar nombres');
    await line(page,'L1',.8,.13,.29);await line(page,'L2',.92,.13,.29);
    const order=()=>page.locator('.annotation-scene-group[data-scene="scene-1"] .annotation-jump').allTextContents();
    assert.deepEqual(await order(),['H1','M1','L1','L2']);
    const handle=page.locator('.annotation-card').filter({has:page.locator('.annotation-jump').filter({hasText:/^L2$/})}).locator('.shot-reorder-handle');
    const source=await handle.boundingBox(),target=await page.locator('.annotation-card').first().boundingBox();
    await drag(page,center(source),{x:target.x+60,y:target.y+12});assert.deepEqual(await order(),['L2','H1','M1','L1']);
    assert(!(await page.locator('#shot-details-dialog').isVisible()),'Arrastrar no abre la ficha');
    await page.locator('#undo-button').click();assert.deepEqual(await order(),['H1','M1','L1','L2']);await page.locator('#redo-button').click();assert.deepEqual(await order(),['L2','H1','M1','L1']);
    await handle.focus();await page.keyboard.press('Alt+ArrowDown');assert.deepEqual(await order(),['H1','L2','M1','L1']);
    await handle.focus();await page.keyboard.press('Alt+ArrowUp');assert.deepEqual(await order(),['L2','H1','M1','L1']);
    const l=(await notes(page)).find(item=>item.shotName==='L2'),label=page.locator(`.document-shot-label[data-annotation-id="${l.id}"]`);
    const labelBox=await label.boundingBox(),lineLocator=page.locator(`g[data-annotation-id="${l.id}"]>line`),lineBox=await lineLocator.boundingBox();
    await drag(page,center(labelBox),{x:lineBox.x-300,y:lineBox.y+lineBox.height*.65});
    const anchored=(await notes(page)).find(item=>item.id===l.id);assert(anchored.lineLabel);assert.equal(anchored.lineLabel.side,'left');assert(!anchored.labelPosition);
    const attached=await label.boundingBox();assert(Math.abs(lineBox.x-attached.x-attached.width-13)<3,'El título queda pegado al lado de la línea');
    const hitPath=page.locator(`g[data-annotation-id="${l.id}"] .line-hit-target`);await hitPath.focus();await page.keyboard.press('Enter');await page.keyboard.press('Shift+ArrowDown');
    const followed=await label.boundingBox();assert(Math.abs(followed.y-attached.y-10)<3,'El título acompaña a la línea al moverla');
    assert.deepEqual((await notes(page)).find(item=>item.id===l.id).lineLabel,anchored.lineLabel);
    const escapeBox=await label.boundingBox();await page.mouse.move(...Object.values(center(escapeBox)));await page.mouse.down();await page.mouse.move(lineBox.x+200,lineBox.y+80,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();
    assert.deepEqual((await notes(page)).find(item=>item.id===l.id).lineLabel,anchored.lineLabel,'Escape cancela mover el título');
    await page.locator('#zoom-in').click();await ready(page);assert.deepEqual((await notes(page)).find(item=>item.id===l.id).lineLabel,anchored.lineLabel);
    await page.locator('#fit-width').click();await ready(page);
    const rect=await page.locator(`g[data-annotation-id="${h.id}"] rect`).first().boundingBox();await page.mouse.click(...Object.values(center(rect)));
    await page.locator('#highlight-action').waitFor({state:'visible'});assert(!(await page.locator('#shot-details-dialog').isVisible()));
    const actionBox=await page.locator('#highlight-action').boundingBox();assert(actionBox.width<250&&actionBox.height<50,'La corrección se ofrece en una opción pequeña junto al resalte');await page.screenshot({path:path.join(output,'accion-resalte.png'),fullPage:true});
    await page.locator('#correct-highlight').click();await page.locator('#highlight-correction-bar').waitFor({state:'visible'});
    const oldHighlight=(await notes(page)).find(item=>item.id===h.id);await selectText(page,'Ana encuentra una carta.');
    assert.deepEqual((await notes(page)).find(item=>item.id===h.id),oldHighlight,'Seleccionar no guarda antes de aplicar');
    await page.locator('#apply-highlight-correction').click();await page.locator('#highlight-correction-bar').waitFor({state:'hidden'});
    const corrected=(await notes(page)).find(item=>item.id===h.id);assert.equal(corrected.text,'Ana encuentra una carta.');assert.equal(corrected.shotName,'H1');assert.equal(corrected.shotId,h.shotId);assert.notDeepEqual(corrected.rects,oldHighlight.rects);
    await page.locator('#undo-button').click();assert.deepEqual((await notes(page)).find(item=>item.id===h.id),oldHighlight);await page.locator('#redo-button').click();
    await correct(page,h.id);await selectText(page,'Una luz ilumina la mesa.');await page.keyboard.press('Escape');assert.deepEqual((await notes(page)).find(item=>item.id===h.id),corrected);
    // La corrección elimina las partes sobrantes de un plano entre páginas.
    await importNotes(page,[{...corrected,id:'continuation',page:2,rects:[{x:.11,y:.12,width:.4,height:.02}]}]);
    await page.waitForFunction(()=>document.querySelector('.annotation-card[data-id="continuation"]'));
    const continuationOrder=(await notes(page)).find(item=>item.id==='continuation').shotOrder;
    await page.locator(`.annotation-card[data-id="${h.id}"] .shot-reorder-handle`).focus();await page.keyboard.press('Alt+ArrowDown');
    assert.equal((await notes(page)).find(item=>item.id==='continuation').shotOrder,continuationOrder,'Ordenar en una escena no altera el orden de otra escena');await page.locator('#undo-button').click();
    await correct(page,h.id);await selectText(page,'Una luz ilumina la mesa.');await page.locator('#apply-highlight-correction').click();
    assert.equal((await notes(page)).filter(item=>item.shotId===h.shotId).length,1);await page.locator('#undo-button').click();assert.equal((await notes(page)).filter(item=>item.shotId===h.shotId).length,2);await page.locator('#redo-button').click();
    await palette(page);assert.equal(await page.locator('#preset-colors button').count(),8);await page.locator('#preset-colors button').nth(1).click();
    assert.equal(await page.locator('#annotation-color').inputValue(),'#e77c6e');await palette(page);await page.locator('#choose-custom-color').click();await page.locator('#custom-color-hex').fill('#123456');
    assert.deepEqual(await Promise.all(['red','green','blue'].map(id=>page.locator('#custom-color-'+id).inputValue())),['18','52','86']);
    await page.locator('#custom-color-red').fill('300');await page.locator('#save-custom-color').click();assert(await page.locator('#color-picker-dialog').isVisible());assert.equal(await page.locator('#annotation-color').inputValue(),'#e77c6e');
    for(const [id,value] of [['red','80'],['green','100'],['blue','120']])await page.locator('#custom-color-'+id).fill(value);
    assert.equal(await page.locator('#custom-color-hex').inputValue(),'#506478');await page.locator('#save-custom-color').click();assert.equal(await page.locator('#annotation-color').inputValue(),'#506478');
    for(let i=1;i<=9;i++){await palette(page);await custom(page,'#12000'+i);}
    await palette(page);assert(!(await page.locator('#recent-color-section').isVisible()));await page.locator('#choose-custom-color').click();assert.deepEqual(await page.locator('#recent-colors button').evaluateAll(nodes=>nodes.map(n=>n.dataset.color)),Array.from({length:8},(_,i)=>'#12000'+(9-i)));
    await page.screenshot({path:path.join(output,'paleta-colores.png'),fullPage:true});await page.locator('#choose-custom-color').click();await page.locator('#custom-color-hex').fill('nohex');await page.locator('#save-custom-color').click();assert(await page.locator('#color-picker-dialog').isVisible());await page.locator('#cancel-color-picker').click();assert.equal(await page.locator('#annotation-color').inputValue(),'#120009');
    const beforeColor=(await notes(page)).find(item=>item.id===l.id).color;
    await page.locator(`.annotation-card[data-id="${l.id}"] .edit-annotation`).click();await page.locator('#edit-color-launch').click();await custom(page,'#abcdef');assert(await page.locator('#edit-shot-dialog').isVisible());assert.equal((await notes(page)).find(item=>item.id===l.id).color,beforeColor);await page.locator('#cancel-edit-shot').click();assert.equal((await notes(page)).find(item=>item.id===l.id).color,beforeColor);
    await page.locator(`.annotation-card[data-id="${l.id}"] .edit-annotation`).click();await page.locator('#edit-color-launch').click();await page.locator('#choose-custom-color').click();await page.locator('#recent-colors button').first().click();await page.locator('#save-custom-color').click();await page.locator('#edit-shot-form button[type="submit"]').click();assert.equal((await notes(page)).find(item=>item.id===l.id).color,'#abcdef');await page.locator('#undo-button').click();assert.equal((await notes(page)).find(item=>item.id===l.id).color,beforeColor);await page.locator('#redo-button').click();
    const finalNotes=await notes(page),finalOrder=await order();const downloading=page.waitForEvent('download');await page.locator('#project-menu summary').click();await page.locator('#save-backup').click();const backupPath=path.join(output,'interacciones.json');await(await downloading).saveAs(backupPath);assert.deepEqual(JSON.parse(fs.readFileSync(backupPath,'utf8')).annotations,finalNotes);
    await page.reload();await page.locator('#file-input').setInputFiles({name:'interacciones.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.deepEqual(await notes(page),finalNotes);assert.deepEqual(await order(),finalOrder);
    await palette(page);assert.equal(await page.locator('#recent-colors button').count(),8);assert.equal(await page.locator('#recent-colors button').first().getAttribute('data-color'),'#abcdef');await page.locator('#close-color-picker').click();
    // Arrastre táctil y paleta adaptados al móvil.
    const mobile=await browser.newContext({viewport:{width:390,height:900},isMobile:true,hasTouch:true});await mobile.addInitScript(({saved,colors})=>{localStorage.setItem('plano-notes-v1:'+saved.fingerprint,JSON.stringify(saved));localStorage.setItem('plano-custom-colors-v1',JSON.stringify(colors));},{saved:await stored(page),colors:['#abcdef']});
    const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(base);await touch.locator('#file-input').setInputFiles({name:'interacciones.pdf',mimeType:'application/pdf',buffer});await ready(touch);await touch.locator('#toggle-annotations').click();
    const cards=touch.locator('.annotation-scene-group[data-scene="scene-1"] .annotation-card');await cards.nth(1).scrollIntoViewIfNeeded();const a=center(await cards.nth(1).locator('.shot-reorder-handle').boundingBox()),b=await cards.first().boundingBox(),initial=await cards.locator('.annotation-jump').allTextContents();
    const cdp=await mobile.newCDPSession(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x+60-a.x)*i/12,y:a.y+(b.y+10-a.y)*i/12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notDeepEqual(await cards.locator('.annotation-jump').allTextContents(),initial,'Ordena con tacto sin abrir la ficha');assert(!(await touch.locator('#shot-details-dialog').isVisible()));
    await touch.locator('#toggle-annotations').click();await palette(touch);await touch.locator('#choose-custom-color').click();assert(await touch.locator('#color-picker-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await touch.screenshot({path:path.join(output,'paleta-colores-movil.png'),fullPage:true});await mobile.close();
    assert.deepEqual(errors,[]);console.log('OK: orden con ratón/teclado/tacto, títulos ligados y prioritarios, corrección/cancelación entre páginas, paleta de 8 colores, RGB/HEX, recientes, historial, JSON/local y móvil.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
