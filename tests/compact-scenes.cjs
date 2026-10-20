/* Portada compacta, solo contenido de escenas y fidelidad de la vista de impresión. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const scenes=require('../scene-analysis.js');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('#render-status').hidden&&document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
async function view(page,value){if(!await page.locator('#view-mode-button').isVisible())await page.locator('#toggle-annotations').click();await page.locator('#scene-select').selectOption(value, {force:true});await ready(page);}
(async()=>{
  const furniture=scenes.pageFurniture([{lines:[{text:'EL ULTIMO PLANO',y:.02},{text:'1',y:.95}]},{lines:[{text:'EL ULTIMO PLANO',y:.02},{text:'ANA',y:.07}]}]);
  assert(furniture({text:'EL ULTIMO PLANO',y:.02}));assert(furniture({text:'1',y:.95}));assert(!furniture({text:'ANA',y:.07}));
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
  const cover=pdf.addPage([595,842]);
  const text=(page,value,x,y,size=12)=>page.drawText(value,{x,y,size,font});
  text(cover,'EL ULTIMO PLANO',170,600,22);text(cover,'Guion de Ana Torres',180,555);text(cover,'ana@example.test',65,120);
  text(cover,'Escrito para produccion independiente',65,500);text(cover,'Contacto de produccion',65,480);text(cover,'Copyright 2026',65,460);text(cover,'Version de trabajo 3',65,440);
  const pages=[cover];
  for(let i=2;i<=4;i++){
    const page=pdf.addPage([595,842]);pages.push(page);
    text(page,'EL ULTIMO PLANO',65,815);text(page,String(i),560,805);text(page,'BORRADOR DE TRABAJO',65,24);text(page,String(i),560,12);
  }
  text(pages[1],'1 INT. CASA - DIA',65,760);text(pages[1],'Ana abre la puerta lentamente.',65,724);text(pages[1],'Una luz tenue ilumina la estancia.',65,704);text(pages[1],'ANA',250,684);
  text(pages[2],'ANA',250,760);text(pages[2],'Tenemos que salir de aqui.',120,742);text(pages[2],'Ana se levanta y recoge su mochila.',65,700);
  text(pages[2],'2 EXT. CALLE - NOCHE',65,430);text(pages[2],'La calle permanece vacia.',65,390);text(pages[2],'Se escucha un coche a lo lejos.',65,370);
  text(pages[3],'Un coche dobla lentamente la esquina.',65,760);text(pages[3],'Ana observa desde la acera.',65,740);text(pages[3],'El coche se detiene frente a ella.',65,720);
  const buffer=Buffer.from(await pdf.save());fs.writeFileSync(path.join(output,'portada-y-escenas.pdf'),buffer);
  const browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.locator('#file-input').setInputFiles({name:'portada-y-escenas.pdf',mimeType:'application/pdf',buffer});await ready(page);
    assert.equal(await page.locator('.script-cover-card').count(),1);
    const card=page.locator('.script-cover-card'),cardText=await card.textContent(),cardBox=await card.boundingBox();
    assert(cardText.includes('EL ULTIMO PLANO')&&cardText.includes('Guion de Ana Torres')&&cardText.includes('ana@example.test'));
    const sceneBox=await page.locator('.page-window').first().boundingBox();
    assert(Math.abs(cardBox.width-sceneBox.width)<1,'La portada tiene el mismo ancho que el guion');
    const coverOverflow=await card.evaluate(card=>[card,card.querySelector('.cover-card-info')].map(el=>({client:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY})));
    assert(coverOverflow.every(el=>el.scroll<=el.client+1&&!['auto','scroll'].includes(el.overflow)),'Todo el contenido cabe sin scroll interno');
    assert(cardText.includes('Version de trabajo 3'),'Incluye los datos finales de portadas largas');
    assert.equal(await page.locator('.page-slot[data-page="1"]').count(),0,'No muestra la página de portada original en el trabajo');
    assert.equal(await page.locator('.script-scene-block').count(),2);assert.equal(await page.locator('.page-slot').count(),4);
    assert.equal(await page.locator('.sheet-label').count(),0,'No añade numeración de página a las escenas de trabajo');
    for(const slot of await page.locator('.page-slot').all()){
      await slot.scrollIntoViewIfNeeded();await slot.locator('.textLayer').waitFor();
      const padding=await slot.locator('.scene-paper').evaluate(el=>({top:parseFloat(getComputedStyle(el).paddingTop),bottom:parseFloat(getComputedStyle(el).paddingBottom)}));
      assert(padding.top>=30&&padding.bottom>=30,'Margen visual arriba y abajo de cada recorte');
      assert(!(await slot.locator('.textLayer').textContent()).includes('BORRADOR DE TRABAJO'));
      assert(!(await slot.locator('.textLayer').textContent()).includes('EL ULTIMO PLANO'));
      const pageNumbers=await slot.evaluate(slot=>{
        const content=slot.querySelector('.pdf-page-content'),bounds=content.getBoundingClientRect();
        return [...slot.querySelectorAll('.textLayer span')].filter(span=>/^[234]$/.test(span.textContent.trim())).filter(span=>{const y=(span.getBoundingClientRect().top-bounds.top)/bounds.height;return y<.12||y>.88;}).length;
      });
      assert.equal(pageNumbers,0,'Oculta los números de página y conserva los de escena');
    }
    const ranges=await page.evaluate(()=>state.segments.map(s=>({top:s.top,bottom:s.bottom,sourceTop:s.sourceTop,sourceBottom:s.sourceBottom})));
    assert(ranges.every(s=>s.top>0&&s.bottom<1),'Recorta los márgenes originales y grandes blancos');
    await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,'portada-compacta.png'),fullPage:true});
    await view(page,'editing');assert.equal(await page.locator('.script-cover-card').count(),1);assert.equal(await page.locator('.page-slot[data-page="1"]').count(),0);
    await view(page,'scene-2');assert.equal(await page.locator('.script-cover-card').count(),0);assert.equal(await page.locator('.script-scene-block').count(),1);
    await view(page,'print');assert.equal(await page.locator('.page-slot').count(),4);assert.equal(await page.locator('.scene-paper,.script-cover-card').count(),0);
    assert(await page.locator('.page-slot[data-page="1"] .textLayer').textContent().then(text=>text.includes('EL ULTIMO PLANO')));
    for(const number of [1,3]){
      const slot=page.locator(`.page-slot[data-page="${number}"]`);await slot.scrollIntoViewIfNeeded();await slot.locator('.textLayer').waitFor();
      const identical=await page.evaluate(async number=>{
        const context=[...state.viewer.contexts.values()].find(c=>c.segment.page===number);await ensurePage(context);
        const displayed=context.content.querySelector('canvas'),reference=document.createElement('canvas');reference.width=displayed.width;reference.height=displayed.height;
        const page=await state.pdf.getPage(number),ratio=Math.min(devicePixelRatio||1,2);
        await page.render({canvasContext:reference.getContext('2d'),viewport:context.viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;
        const a=displayed.getContext('2d').getImageData(0,0,displayed.width,displayed.height).data,b=reference.getContext('2d').getImageData(0,0,reference.width,reference.height).data;
        const same=a.every((value,index)=>value===b[index]);reference.width=reference.height=0;return same;
      },number);
      assert(identical,`La página ${number} en impresión es idéntica píxel a píxel al PDF original`);
    }
    assert((await page.locator('.page-slot[data-page="3"] .textLayer').textContent()).includes('BORRADOR DE TRABAJO'),'Impresión recupera el pie original');
    const unchanged=await page.evaluate(async()=>Array.from(new Uint8Array(await(await fetch(state.url)).arrayBuffer())));assert.deepEqual(unchanged,Array.from(buffer),'Los bytes del PDF no se modifican');
    await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,'portada-impresion-original.png'),fullPage:true});
    await view(page,'all');await page.setViewportSize({width:390,height:900});await page.locator('#fit-width').click();await ready(page);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(Math.abs((await card.boundingBox()).width-(await page.locator('.page-window').first().boundingBox()).width)<1,'En móvil la portada conserva el ancho del guion');
    assert(await card.evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.querySelector('.cover-card-info').scrollHeight<=el.querySelector('.cover-card-info').clientHeight+1),'En móvil tampoco se recortan los datos');
    await page.screenshot({path:path.join(output,'portada-compacta-movil.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('OK: solo escenas, portada compacta con sus datos, cabeceras/pies/números ocultos, márgenes visuales, móvil y vista de impresión idéntica al PDF original (píxeles y bytes).');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
