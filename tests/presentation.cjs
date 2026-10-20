/* Limpieza de apariencia, menú propio de vistas, etiquetas sólidas y jerarquía de tabla. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const output=path.join(__dirname,'.output');fs.mkdirSync(output,{recursive:true});
async function ready(page){await page.waitForFunction(()=>document.querySelector('.page-slot[data-ready="true"] .textLayer')&&document.querySelector('#render-status').hidden&&document.querySelector('.script-workspace').getAttribute('aria-busy')==='false');}
function lum(channels){return channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
function ratio(a,b){return(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
(async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Courier);
 for(const heading of ['INT. CASA DE JUAN PABLO, HABITACION - NOCHE','EXT. CALLE - DIA']){
   const sheet=pdf.addPage([595,842]);sheet.drawText(heading,{x:65,y:770,size:12,font});
   for(let y=690;y>=450;y-=60)sheet.drawText('Ana prepara la camara para el siguiente plano.',{x:65,y,size:12,font});
 }
 const buffer=Buffer.from(await pdf.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,{channel:'msedge',headless:true});
 try{
   const context=await browser.newContext({viewport:{width:1540,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','true');localStorage.setItem('plano-appearance-v1',JSON.stringify({mode:'dark',preset:'pink',accent:'#f000aa',surface:'#aa44cc',contrast:'#992299'}));localStorage.setItem('plano-notes-v1:sentinel','Notas existentes');localStorage.setItem('plano-custom-colors-v1','["#112233"]');});
   const base=process.env.PLANO_TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;await page.goto(base);
   assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(await page.locator('html').getAttribute('data-palette'),'default');
   assert.equal(await page.evaluate(()=>localStorage.getItem('plano-appearance-v1')),null,'Elimina la personalización anterior');
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('plano-appearance-v2'))),{mode:'dark',preset:'default'});
   assert.equal(await page.evaluate(()=>localStorage.getItem('plano-notes-v1:sentinel')),'Notas existentes');assert.equal(await page.evaluate(()=>localStorage.getItem('plano-custom-colors-v1')),'["#112233"]');
   const surface=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());assert.equal(surface.slice(1,3),surface.slice(3,5));assert.equal(surface.slice(3,5),surface.slice(5,7),'El fondo predeterminado es gris neutro');
   await page.screenshot({path:path.join(output,'oscuro-predeterminado-neutro.png'),fullPage:true});
   await page.locator('#file-input').setInputFiles({name:'Presentacion.pdf',mimeType:'application/pdf',buffer});await ready(page);
   assert(!(await page.locator('#scene-select').isVisible()));await page.locator('#view-mode-button').click();assert(await page.locator('#view-mode-menu').isVisible());
   assert.deepEqual(await page.locator('#view-mode-menu [data-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.view)),['all','editing','print','scene-1','scene-2']);
   assert.equal(await page.locator('#view-mode-menu [aria-checked="true"]').getAttribute('data-view'),'all');
   await page.screenshot({path:path.join(output,'menu-vistas-propio.png'),fullPage:true});
   await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.view),'scene-2');await page.keyboard.press('Enter');await ready(page);assert.equal(await page.evaluate(()=>state.scene),'scene-2');assert(!(await page.locator('#view-mode-menu').isVisible()));
   await page.locator('#view-mode-button').click();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await ready(page);assert.equal(await page.evaluate(()=>state.scene),'editing');
   await page.locator('#view-mode-button').click();await page.locator('[data-view="all"]').click();await ready(page);
   const fingerprint=await page.evaluate(()=>state.fingerprint),colors=['#e8b83f','#153560','#ffffff','#000000'];
   const records=colors.map((color,i)=>({id:'P'+i,shotId:'P'+i,shotName:'P'+(i+1),type:'line',page:i===3?2:1,color,start:{x:.86,y:.17+i*.045},end:{x:.86,y:.23+i*.045},description:'Preparacion del siguiente plano.',createdAt:'2026-10-20T12:00:00Z'}));
   await page.locator('#backup-input').setInputFiles({name:'planos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'PLANO',version:1,fingerprint,annotations:records}))});await page.waitForFunction(()=>state.annotations.length===4);await ready(page);
   for(const record of records){
     const tag=page.locator(`.document-shot-tag[data-annotation-id="${record.id}"]`);await tag.scrollIntoViewIfNeeded();await ready(page);
     const style=await tag.evaluate(el=>{const box=getComputedStyle(el),text=getComputedStyle(el.querySelector('button'));return{background:box.backgroundColor,color:text.color,font:text.fontFamily,weight:Number(text.fontWeight)};});
     const expected=[1,3,5].map(i=>parseInt(record.color.slice(i,i+2),16));assert.deepEqual(style.background.match(/\d+/g).map(Number),expected);assert(style.font.includes('Courier New'));assert(style.weight>=700);assert(ratio(expected,style.color.match(/\d+/g).map(Number))>=4.5,'Nombre legible sobre cualquier color');
   }
   await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,'etiquetas-rellenas.png'),fullPage:true});
   await page.locator('#stage-tabs [data-stage="technical"]').click();
   for(const cell of await page.locator('#technical-table thead th').all())assert(await cell.evaluate(el=>{const s=getComputedStyle(el);return s.textAlign==='center'&&Number(s.fontWeight)>=700&&parseFloat(s.fontSize)>=12;}));
   for(const element of await page.locator('.technical-scene-row strong,.technical-scene-row span').all())assert(await element.evaluate(el=>{const s=getComputedStyle(el);return Number(s.fontWeight)>=700&&parseFloat(s.fontSize)>=12;}));
   await page.screenshot({path:path.join(output,'tabla-tecnica-color-oscuro.png'),fullPage:true});await page.locator('#toggle-theme').click();await page.screenshot({path:path.join(output,'tabla-tecnica-color-claro.png'),fullPage:true});
   await page.locator('#stage-tabs [data-stage="coverage"]').click();await ready(page);await page.setViewportSize({width:390,height:850});await page.waitForTimeout(250);await ready(page);
   await page.locator('#view-mode-button').click();const menu=await page.locator('#view-mode-menu').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=390&&menu.y+menu.height<=850);assert(await page.locator('#view-mode-menu').evaluate(el=>el.scrollWidth<=el.clientWidth));
   await page.screenshot({path:path.join(output,'menu-vistas-propio-movil.png'),fullPage:true});await page.keyboard.press('Escape');assert(await page.locator('#view-mode-button').evaluate(el=>el===document.activeElement));
   await page.locator('#open-appearance').click();await page.locator('[data-appearance-preset="blue"]').click();await page.reload();assert.equal(await page.locator('html').getAttribute('data-palette'),'blue','Las nuevas preferencias de temas se conservan tras la limpieza inicial');
   assert.deepEqual(errors,[]);console.log('OK: limpieza de apariencia anterior sin tocar notas ni colores de planos, oscuro neutro, menú de vistas propio con teclado/móvil, etiquetas sólidas Courier con contraste y tabla con títulos centrados y escenas en negrita.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
