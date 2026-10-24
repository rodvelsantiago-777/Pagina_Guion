/* Equipo por guion, exportaciones y revisión de ortografía real en un worker local. */
process.env.PLANO_TEST_SPELL='1';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib'),ExcelJS=require('../vendor/exceljs.min.js'),crew=require('../project-crew.js');
const out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
const reviewed=page=>page.waitForFunction(()=>state.proofreading.dictionary===PlanoSpelling.version,null,{timeout:30000});
async function download(page,button,name){const pending=page.waitForEvent('download');await page.locator('#project-menu summary').click();await page.locator(button).click();const file=await pending;const target=path.join(out,name);await file.saveAs(target);await page.waitForFunction(()=>!state.exporting&&!state.busy);return fs.readFileSync(target);}
(async()=>{
 assert.deepEqual(crew.validate(),{});assert.throws(()=>crew.validate({director:'a'.repeat(161)}));assert.throws(()=>crew.validate([]));
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Courier);
 for(const [i,heading]of ['INT. CASA - DIA','EXT. CASA - DIA'].entries()){
  const sheet=doc.addPage([595,842]);sheet.drawText(heading,{x:65,y:770,size:12,font});sheet.drawText('La casa tiene una puerta abierta y un herror.',{x:65,y:700,size:12,font});sheet.drawText('MARTIN',{x:220,y:640,size:12,font});sheet.drawText('La pequeña habitación está tranquila.',{x:65,y:600,size:12,font});
 }
 const buffer=Buffer.from(await doc.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[],network=[],requests=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});page.on('request',request=>requests.push(request.url()));
  await page.context().route('**/*',route=>{if(/^https?:/.test(route.request().url())){network.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);assert(!requests.some(url=>url.includes('spanish-spelling')));
  await page.locator('#file-input').setInputFiles({name:'Equipo.pdf',mimeType:'application/pdf',buffer});await ready(page);await reviewed(page);
  assert.deepEqual(await page.evaluate(()=>state.corrections.map(c=>[c.word,c.parts[0].page])),[['herror',1],['herror',2]]);
  assert.equal(await page.evaluate(()=>state.annotations.length),0);assert.equal(await page.locator('.script-correction-mark').count(),2);
  assert(await page.locator('#shot-description-input').evaluate(el=>el.spellcheck&&el.lang==='es'));
  assert.equal(await page.locator('#account-email').evaluate(el=>el.spellcheck),false,'No cambia el campo de correo protegido contra el fallo de Brave');
  const team={director:'Ana Ruiz',producer:'Luis Pérez',assistantDirector:'Marta Díaz',cinematographer:'Pablo López',productionDesigner:'Sofía Torres',soundMixer:'Juan Mora'},savedTeam={roles:crew.entries(team)};
  await page.locator('#project-menu summary').click();await page.locator('#edit-crew').click();
  for(const [key,value]of Object.entries(team))await page.locator('#crew-'+key).fill(value);
  await page.screenshot({path:path.join(out,'equipo-produccion-dialogo.png')});
  await page.locator('#crew-form button[type=submit]').click();assert.deepEqual(await page.evaluate(()=>state.crew),savedTeam);
  await page.locator('#undo-button').click();assert.deepEqual(await page.evaluate(()=>state.crew),{});await page.locator('#redo-button').click();assert.deepEqual(await page.evaluate(()=>state.crew),savedTeam);
  await page.locator('#stage-tabs [data-stage=technical]').click();await page.locator('#technical-crew').click();await page.locator('#crew-director').fill('No guardar');await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>state.crew),savedTeam);
  await page.evaluate(()=>{state.annotations=validateNotes([{id:'line',shotName:'P1',page:1,type:'line',color:'#e8b83f',start:{x:.8,y:.2},end:{x:.8,y:.6},description:'Plano de prueba'}]);changed();});
  const cell=page.locator('tr[data-shot-id=line] [data-field=description]');await cell.locator('.technical-cell-value').click();assert(await cell.locator('textarea').evaluate(el=>el.spellcheck&&el.lang==='es'));await page.keyboard.press('Escape');
  const excel=await download(page,'#export-excel','equipo-guion-tecnico.xlsx'),book=new ExcelJS.Workbook();await book.xlsx.load(excel);const sheet=book.getWorksheet('Guion técnico');
  for(const [key,address]of Object.entries({director:'D5',producer:'J5',assistantDirector:'E7',cinematographer:'J7',productionDesigner:'E9',soundMixer:'J9'}))assert.equal(sheet.getCell(address).value,team[key]);
  const full=await download(page,'#export-all','equipo-guion-completo.pdf');
  const technical=await page.evaluate(async bytes=>{const pdf=await pdfjsLib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWasm:true,useSystemFonts:false,useWorkerFetch:false,BinaryDataFactory:LocalBinaryFactory}).promise;try{const text=await(await pdf.getPage(3)).getTextContent();return text.items.map(item=>item.str).join(' ').replace(/\s+/g,' ');}finally{await pdf.destroy();}},Array.from(full));
  for(const value of Object.values(team))assert(technical.includes(value),'El PDF incluye '+value);
  const backup=JSON.parse(await download(page,'#save-backup','equipo-notas.json'));assert.deepEqual(backup.crew,savedTeam);assert.equal(backup.corrections[0].source,'spelling');
  await page.reload();await page.locator('#file-input').setInputFiles({name:'Equipo.pdf',mimeType:'application/pdf',buffer});await ready(page);assert.deepEqual(await page.evaluate(()=>state.crew),savedTeam);assert.equal(await page.evaluate(()=>state.corrections.length),2);assert(!await page.evaluate(()=>Boolean(spellingJob)),'No repite una revisión ya guardada');
  await page.locator('#scene-select').selectOption('print',{force:true});await ready(page);
  await page.screenshot({path:path.join(out,'ortografia-automatica-pdf.png')});
  await page.locator('.script-correction-mark').first().click();assert((await page.locator('#correction-word').textContent()).includes('herror'));await page.locator('#delete-correction').click();assert.equal(await page.evaluate(()=>state.corrections.length),0);assert.deepEqual(await page.evaluate(()=>state.proofreading.ignored),['herror']);
  await page.locator('#undo-button').click();assert.equal(await page.evaluate(()=>state.corrections.length),2);await page.locator('#redo-button').click();
  await page.evaluate(()=>{state.corrections.push(PlanoCorrections.create([{page:1,text:'puerta',rects:[{x:.2,y:.16,width:.1,height:.02}]}],state.pdf.numPages));changed();});
  await page.locator('#project-menu summary').click();await page.locator('#toggle-spelling').click();assert.equal(await page.evaluate(()=>state.proofreading.enabled),false);assert.equal(await page.evaluate(()=>state.corrections.length),1,'Conserva las correcciones manuales');
  await page.locator('#project-menu summary').click();await page.locator('#toggle-spelling').click();await reviewed(page);assert.equal(await page.evaluate(()=>state.corrections.length),1,'Respeta las palabras ignoradas al revisar');
  // Un trabajo antiguo no añade marcas después de cerrar el guion.
  await page.evaluate(()=>{state.proofreading.dictionary='';globalThis.actualScan=PlanoSpelling.scan;PlanoSpelling.scan=()=>new Promise(resolve=>globalThis.finishOldScan=resolve);startSpelling();closeDocument();finishOldScan([{id:'late',word:'herror',parts:[{page:1,text:'herror',rects:[{x:.2,y:.2,width:.1,height:.02}]}]}]);PlanoSpelling.scan=actualScan;});
  await page.waitForFunction(()=>!state.pdf);assert.equal(await page.evaluate(()=>state.corrections.length),0);assert.deepEqual(await page.evaluate(()=>state.crew),{});
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);console.log('OK: equipo/historial/recuperación por guion, Excel y PDF completos, spellcheck nativo sin alterar correo, worker español sin red, geometría de palabras, exclusión de nombres, ignorar/deshacer, desactivar y cancelación sin fugas.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
