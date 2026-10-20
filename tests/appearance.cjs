/* Tema persistente, contraste y aislamiento de los documentos. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
const key='plano-appearance-v2',base=process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const lum=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
async function preset(page,value){if(!await page.locator('#appearance-dialog').isVisible())await page.locator('#open-appearance').click();await page.locator(`[data-appearance-preset="${value}"]`).click();}
async function tokens(page){return page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['page','paper','surface-alt','ink','muted','faint','accent','accent-soft','on-accent','sidebar'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));});}
function readable(t){for(const background of ['paper','surface-alt'])for(const foreground of ['ink','muted','faint','accent'])assert(contrast(t[foreground],t[background])>=4.5,`${foreground} sobre ${background}: ${contrast(t[foreground],t[background])}`);assert(contrast(t.accent,t['accent-soft'])>=4.5);assert(contrast(t.accent,t['on-accent'])>=4.5);}
async function documentSnapshot(page){const snapshot=await page.evaluate(async()=>({
  annotations:JSON.stringify(state.annotations),renderId:state.renderId,viewer:state.viewer.id,scene:state.scene,
  position:document.querySelector('#pdf-stage').scrollTop,
  canvases:[...document.querySelectorAll('.page-slot[data-ready="true"] .pdf-page-content>canvas')].map(c=>c.toDataURL()),
  pdf:Array.from(new Uint8Array(await(await fetch(state.url)).arrayBuffer())),
  paper:[...document.querySelectorAll('.page-window,.scene-paper,.script-cover-card,.document-shot-tag,.document-shot-label')].map(el=>{const s=getComputedStyle(el);return {class:el.className,color:s.color,background:s.backgroundColor,filter:s.filter,font:s.font,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height};})
}));snapshot.canvases=snapshot.canvases.map(value=>createHash('sha256').update(value).digest('hex'));snapshot.pdf=createHash('sha256').update(Buffer.from(snapshot.pdf)).digest('hex');return snapshot;}
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 const cover=pdf.addPage([595,842]);cover.drawText('EL PRIMER PLANO',{x:110,y:600,size:20,font});cover.drawText('Guion de Ana Torres',{x:110,y:550,size:12,font});
 for(const [index,heading] of ['INT. ESTUDIO - DIA','EXT. CALLE - NOCHE'].entries()){
   const sheet=pdf.addPage([595,842]);sheet.drawText(heading,{x:65,y:770,size:12,font});sheet.drawText('Ana prepara la camara.',{x:65,y:710,size:12,font});sheet.drawText('Todo esta listo para rodar.',{x:65,y:680,size:12,font});
 }
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
 try{
   const context=await browser.newContext({viewport:{width:1540,height:1100}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
   assert.equal(await page.locator('html').getAttribute('data-theme'),'light');readable(await tokens(page));
   assert.equal(await page.locator('.upload-area').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
   await page.screenshot({path:path.join(output,'estudio-inicio-claro.png'),fullPage:true});
   await page.locator('#toggle-theme').click();assert.equal(await page.locator('#toggle-theme').getAttribute('aria-pressed'),'true');readable(await tokens(page));
   await page.screenshot({path:path.join(output,'estudio-inicio-oscuro.png'),fullPage:true});
   await page.locator('#open-appearance').click();assert(await page.locator('#appearance-dialog').isVisible());
   assert.equal(await page.locator('[data-appearance-preset]').count(),12);assert.equal(await page.locator('#appearance-dialog input').count(),0,'Solo temas, sin colores libres');
   assert((await page.locator('#appearance-dialog').boundingBox()).width<=280);
   await page.screenshot({path:path.join(output,'estudio-apariencia.png'),fullPage:true});
   await preset(page,'violet');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','Las paletas no cambian el modo elegido');
   const dark=await tokens(page);await page.locator('#toggle-theme').click();const light=await tokens(page);readable(light);
   assert(lum(light.paper)>.9&&lum(dark.paper)<.04,'Las superficies personalizadas conservan la diferencia clara/oscura');
   assert.notEqual(dark.accent,light.accent);
   for(const value of ['default','red','brown','orange','yellow','green','sky','blue','pink','violet','gray','graphite']){
     await preset(page,value);
     for(const mode of ['light','dark']){if(await page.locator('html').getAttribute('data-theme')!==mode)await page.locator('#toggle-theme').click();readable(await tokens(page));}
   }
   await preset(page,'default');
   assert(await page.locator('#open-appearance').evaluate(el=>el===document.activeElement));
   const saved=await page.evaluate(key=>localStorage.getItem(key),key);await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),saved);
   await page.locator('#file-input').setInputFiles({name:'El primer plano.pdf',mimeType:'application/pdf',buffer});await ready(page);
   const fingerprint=await page.evaluate(()=>state.fingerprint),common={shotValue:'PM',shotAngle:'normal',shotLens:'normal',shotMovement:'none',description:'Ana se prepara para rodar. La camara acompaña su mirada.',grip:'Tripode',sound:'Sonido directo',note:'Comprobar continuidad',color:'#e8b83f',createdAt:'2026-10-20T12:00:00Z'};
   const notes=[{...common,id:'line',shotId:'line',shotName:'1A',shotOrder:0,type:'line',page:2,start:{x:.85,y:.12},end:{x:.85,y:.30}},{...common,id:'highlight',shotId:'highlight',shotName:'1B',shotOrder:1,type:'highlight',page:2,text:'Ana prepara la camara.',rects:[{x:.11,y:.14,width:.3,height:.02}]}];
   await page.locator('#backup-input').setInputFiles({name:'notas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:notes}))});await page.waitForFunction(()=>state.annotations.length===2);await ready(page);
   await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=90);await page.waitForTimeout(150);
   const before=await documentSnapshot(page);await page.locator('#toggle-theme').click();
   await preset(page,'red');
   assert.deepEqual(await documentSnapshot(page),before,'El tema no cambia los píxeles, bytes, marcas, dimensiones, escena, posición ni renderiza el PDF de nuevo');
   assert.equal(await page.locator('#appearance-dialog').evaluate(el=>el.matches(':popover-open')),false);
   // El diálogo no propaga atajos al visor.
   await page.locator('[data-tool="line"]').click();await page.locator('#open-appearance').click();await page.keyboard.press('h');assert.equal(await page.evaluate(()=>state.tool),'line');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>state.tool),'line');await page.locator('[data-tool="select"]').click();
   await preset(page,'default');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
   await page.locator('#scene-select').selectOption('print', {force:true});await ready(page);await page.waitForFunction(()=>document.querySelector('.page-slot[data-page="2"][data-ready="true"]'));const printBefore=await documentSnapshot(page);await page.locator('#toggle-theme').click();assert.deepEqual(await documentSnapshot(page),printBefore,'La vista de impresión también conserva píxeles y documento al cambiar el tema');await page.locator('#toggle-theme').click();await page.locator('#scene-select').selectOption('all', {force:true});await ready(page);
   await page.screenshot({path:path.join(output,'estudio-cobertura-claro.png'),fullPage:true});await page.locator('#toggle-theme').click();await page.screenshot({path:path.join(output,'estudio-cobertura-oscuro.png'),fullPage:true});
   await page.locator('.annotation-card').first().click();await page.screenshot({path:path.join(output,'estudio-ficha-oscura.png'),fullPage:true});await page.keyboard.press('Escape');
   await page.locator('#stage-tabs [data-stage="technical"]').click();await page.screenshot({path:path.join(output,'estudio-tecnico-oscuro.png'),fullPage:true});
   await page.locator('[data-field="description"] .technical-cell-value').first().click();await page.locator('.technical-cell-editor textarea').fill('Editado en modo oscuro');await page.keyboard.press('Control+Enter');assert.equal(await page.evaluate(()=>state.annotations[0].description),'Editado en modo oscuro');
   for(const width of [1540,1280,1060,1024,768,390,320]){
     await page.setViewportSize({width,height:900});
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No hay desborde horizontal a ${width}px`);
     const header=await page.locator('.topbar').boundingBox(),right=await page.locator('.editor-actions').boundingBox();assert(right.x+right.width<=width,`Los controles caben en ${width}px`);
     const tabs=await page.locator('#stage-tabs').boundingBox();assert(tabs.y+tabs.height<=header.y+header.height,`Los tres modos caben en la cabecera a ${width}px`);
   }
   await page.screenshot({path:path.join(output,'estudio-tecnico-movil.png'),fullPage:true});
   await page.locator('#open-appearance').click();assert(await page.locator('#appearance-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(output,'estudio-apariencia-movil.png'),fullPage:true});await page.keyboard.press('Escape');
   await page.locator('#stage-tabs [data-stage="coverage"]').click();await ready(page);await page.screenshot({path:path.join(output,'estudio-cobertura-movil.png'),fullPage:true});
   await page.locator('#editor-home').click();for(const width of [320,390,768,1024,1540]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Inicio sin desborde a ${width}px`);}
   assert.deepEqual(errors,[]);await context.close();
   // Datos corruptos y almacenamiento bloqueado no impiden abrir ni personalizar.
   for(const blocked of [false,true]){
     const context=await browser.newContext(),page=await context.newPage(),failures=[];page.on('pageerror',e=>failures.push(e.message));
     await page.addInitScript(({key,blocked})=>{if(blocked)Object.defineProperty(window,'localStorage',{get(){throw new Error('Bloqueado');}});else localStorage.setItem(key,JSON.stringify({mode:'invalid',accent:'invalid',surface:null,contrast:'url(javascript:1)'}));},{key,blocked});
     await page.goto(base);assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.locator('#toggle-theme').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(failures,[]);await context.close();
   }
   console.log('OK: doce temas cerrados en un menú compacto, claro/oscuro, contraste AA, persistencia, almacenamiento no disponible, teclado, edición y responsive 320–1540px. PDF idéntico en píxeles/bytes/marcas/posición al cambiar de tema.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
