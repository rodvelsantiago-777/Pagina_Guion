/* Reglas de redacción y avisos visibles con el diccionario real, sin servicios externos. */
process.env.PLANO_TEST_SPELL='1';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const load=name=>require(process.env.PLANO_RUNTIME_MODULES?path.join(process.env.PLANO_RUNTIME_MODULES,name):name);
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib'),review=require('../language-review.js');
const sample='habiína una habitación un una habitación';
assert(review.syntax(sample).some(issue=>issue.rule==='double-article'));
assert(review.syntax(sample).some(issue=>issue.rule==='repeated-phrase'));
assert(review.syntax('La puerta está está abierta.').some(issue=>issue.rule==='repeated-word'));
assert(review.syntax('un habitación').some(issue=>issue.replacement==='una habitación'));
assert(review.syntax('habían unas habitaciones').some(issue=>issue.replacement==='había'));
assert(review.syntax('de el cuarto').some(issue=>issue.replacement==='del'));
for(const correct of ['Había una habitación en una casa.','El agua está fría.','La casa y la casa de al lado.','La casa, la casa de Juan.','La habitación es tranquila.','Él mira a El País.'])assert.deepEqual(review.syntax(correct),[],correct);
const out=path.join(__dirname,'.output');fs.mkdirSync(out,{recursive:true});
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
(async()=>{
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Courier),sheet=doc.addPage([595,842]);
 sheet.drawText('INT. CASA - DIA',{x:65,y:770,size:12,font});
 sheet.drawText('habiína una habitación un',{x:65,y:700,size:12,font});sheet.drawText('una habitación',{x:65,y:685,size:12,font});
 const root=path.resolve(__dirname,'..'),server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address='http://127.0.0.1:'+server.address().port,buffer=Buffer.from(await doc.save()),browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1100}}),errors=[],requests=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('request',r=>requests.push(r.url()));
  await page.context().route('**/*',route=>/^https?:/.test(route.request().url())&&!route.request().url().startsWith(address+'/')?route.abort():route.continue());
  await page.goto(address);
  assert(!requests.some(url=>url.includes('spanish-spelling.js')));
  await page.locator('#file-input').setInputFiles({name:'Redacción.pdf',mimeType:'application/pdf',buffer});await ready(page);
  await page.waitForFunction(()=>state.proofreading.dictionary===PlanoSpelling.version);
  const marks=await page.evaluate(()=>state.corrections);
  assert(marks.some(mark=>mark.source==='spelling'&&mark.word==='habiína'));
  assert(marks.some(mark=>mark.source==='syntax'&&mark.word.includes('un\nuna')),'Detecta artículos incompatibles incluso entre líneas del PDF');
  assert(marks.some(mark=>mark.message.includes('frase parece repetida')));
  const duplicate=marks.find(mark=>mark.word.includes('un\nuna'));assert.equal(duplicate.parts[0].rects.length,2,'Subraya ambas líneas en su posición');
  // Al abrir el plano se revisan los valores ya guardados, además de lo que se escriba después.
  await page.evaluate(text=>{state.annotations=validateNotes([{id:'L',shotName:'P1',page:1,type:'line',color:'#e8b83f',start:{x:.8,y:.15},end:{x:.8,y:.6},description:text}]);changed();},sample);
  await page.locator('.annotation-card[data-id=L] .edit-annotation').click();
  const input=page.locator('#edit-shot-description'),feedback=input.locator('..').locator('.writing-feedback');
  await feedback.locator('.writing-feedback-fragment',{hasText:'habiína'}).waitFor({timeout:30000});
  assert((await feedback.textContent()).includes('dos artículos'));
  assert((await feedback.textContent()).includes('frase parece repetida'));
  assert(await input.evaluate(el=>el.spellcheck));
  await page.screenshot({path:path.join(out,'revision-redaccion-plano.png')});
  // Las propuestas solo cambian el borrador cuando el usuario las elige.
  await input.fill('un habitación');await feedback.getByRole('button',{name:'Usar «una habitación»',exact:true}).waitFor();
  assert.equal(await input.inputValue(),'un habitación');await feedback.getByRole('button',{name:'Usar «una habitación»',exact:true}).click();
  assert.equal(await input.inputValue(),'una habitación');await page.waitForFunction(()=>document.querySelector('#edit-shot-description').nextElementSibling.textContent==='Sin avisos detectados');
  await input.fill(sample);await input.fill('La habitación está tranquila.');
  await page.waitForFunction(()=>document.querySelector('#edit-shot-description').nextElementSibling.textContent==='Sin avisos detectados');
  assert(!(await feedback.textContent()).includes('habiína'),'Un resultado tardío no reemplaza la revisión del texto nuevo');
  await page.locator('#cancel-edit-shot').click();assert.equal(await page.evaluate(()=>state.annotations[0].description),sample,'Cancelar mantiene el texto guardado');
  // La tabla usa el mismo corrector y permite guardar con sus atajos habituales.
  await page.locator('#stage-tabs [data-stage=technical]').click();const cell=page.locator('tr[data-shot-id=L] [data-field=description]');await cell.locator('.technical-cell-value').click();
  const tableInput=cell.locator('textarea');await tableInput.fill('habían unas habitaciones');
  const tableFeedback=cell.locator('.writing-feedback'),proposal=tableFeedback.getByRole('button',{name:'Usar «había»',exact:true});await proposal.waitFor();await proposal.focus();await page.keyboard.press('Enter');
  assert.equal(await tableInput.inputValue(),'había unas habitaciones');await page.keyboard.press('Control+Enter');assert.equal(await page.evaluate(()=>state.annotations[0].description),'había unas habitaciones');
  assert.equal(requests.filter(url=>url.includes('spanish-spelling.js')).length,1,'Comparte la carga del diccionario entre PDF y formularios');
  // El corrector funciona también dentro de la tabla separada y conserva su edición sincronizada.
  await page.locator('#stage-tabs [data-stage=technical]').click({button:'right'});const opened=page.waitForEvent('popup');await page.locator('#technical-window-menu button').click();const other=await opened;other.on('pageerror',error=>errors.push(error.message));
  const otherCell=other.locator('tr[data-shot-id=L] [data-field=note]');await otherCell.locator('.technical-cell-value').click();await otherCell.locator('textarea').fill('La puerta está está abierta.');
  await otherCell.locator('.writing-feedback-fragment',{hasText:'está está'}).waitFor();await otherCell.getByRole('button',{name:'Usar «está»',exact:true}).click();await other.keyboard.press('Control+Enter');
  await page.waitForFunction(()=>state.annotations[0].note==='La puerta está abierta.');await other.close();
  // La sintaxis se guarda, se ignora de forma persistente y se recupera con deshacer.
  await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);
  await page.locator(`#pdf-stage [data-annotation-id="review-${duplicate.id}"] .correction-hit-target`).first().focus();await page.keyboard.press('Enter');
  assert((await page.locator('#correction-word').textContent()).includes('dos artículos'));
  await page.locator('#delete-correction').click();assert(await page.evaluate(key=>state.proofreading.ignored.includes(key),duplicate.ignoreKey));
  await page.locator('#undo-button').click();assert(await page.evaluate(id=>state.corrections.some(item=>item.id===id),duplicate.id));
  const fingerprint=await page.evaluate(()=>state.fingerprint);await page.reload();await page.locator('#file-input').setInputFiles({name:'Redacción.pdf',mimeType:'application/pdf',buffer});await ready(page);
  assert.equal(await page.evaluate(()=>state.fingerprint),fingerprint);assert(await page.evaluate(()=>state.corrections.some(mark=>mark.source==='syntax'&&mark.message.includes('artículos'))));
  // El nuevo motor sustituye marcas automáticas antiguas, conservando las manuales.
  await page.evaluate(()=>{state.proofreading.dictionary='';state.corrections.push({...state.corrections[0],id:'old-auto'});state.corrections.push(PlanoCorrections.create([{page:1,text:'Manual',rects:[{x:.3,y:.5,width:.1,height:.02}]}],1));startSpelling();});
  await page.waitForFunction(()=>state.proofreading.dictionary===PlanoSpelling.version);assert(!(await page.evaluate(()=>state.corrections.some(mark=>mark.id==='old-auto'))));assert(await page.evaluate(()=>state.corrections.some(mark=>mark.parts[0].text==='Manual')));
  await page.evaluate(()=>closeDocument());assert.equal(await page.locator('.writing-feedback:not([hidden])').count(),0);
  assert.deepEqual(errors,[]);console.log('OK: ejemplo real, reglas conservadoras, PDF con saltos de línea, avisos en ficha y tabla, sugerencias explícitas, cancelación, resultados tardíos, diccionario compartido, persistencia/ignorar/historial y actualización sin duplicados.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
