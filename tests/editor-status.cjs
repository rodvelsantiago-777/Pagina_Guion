/* Barra inferior: posición, controles reales, página/idioma y revisión sin alterar el texto. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');
const ready=page=>page.waitForFunction(()=>state.rendered&&!state.busy&&document.querySelector('#render-status').hidden);
async function bottomBar(page,selector){
 const position=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return{bottom:r.bottom,left:r.left,right:r.right,height:r.height,screenWidth:innerWidth,screenHeight:innerHeight};});
 assert(Math.abs(position.bottom-position.screenHeight)<3,'La barra permanece al pie de la ventana');assert(position.left>=0&&position.right<=position.screenWidth+1);assert(position.height<150,'La barra se mantiene compacta');
}
(async()=>{
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>globalThis.PlanoWriter&&globalThis.PlanoCloudLibrary);
  await page.evaluate(async()=>{const script=PlanoScreenplay.create('Una historia para revisar',PlanoAccounts.getUser());script.doc.content=[{type:'paragraph',attrs:{kind:'scene',id:crypto.randomUUID()},content:[{type:'text',text:'INT. ESTUDIO - DÍA'}]},{type:'paragraph',attrs:{kind:'action',id:crypto.randomUUID()},content:[{type:'text',text:Array.from({length:120},(_,i)=>'El equipo prepara la toma '+(i+1)+'.').join('\n')}]}];await createNativeScript(script);});
  assert.equal(await page.locator('#writer-page-status').textContent(),'Portada');await bottomBar(page,'.writer-status');
  for(const id of ['#writer-zoom','#writer-spelling'])assert(await page.locator(id).evaluate(el=>Boolean(el.closest('footer.editor-status'))),'Control de escritura al pie: '+id);
  assert.equal(await page.locator('.writer-toolbar #writer-zoom').count(),0);
  await page.locator('#writer-body-tab').click();await page.waitForFunction(()=>document.querySelector('#writer-statistics').textContent.includes('palabras'));
  await page.locator('#writer-zoom').selectOption('1');assert.equal(await page.locator('#writer-zoom-range').inputValue(),'100');
  const revision=await page.evaluate(()=>state.screenplay.revision);await page.locator('#writer-zoom-in').click();assert.equal(await page.locator('#writer-zoom-range').inputValue(),'110');
  await page.locator('#writer-zoom-range').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#writer-zoom-range').inputValue(),'111');
  assert.equal(await page.evaluate(()=>state.screenplay.revision),revision,'Cambiar el zoom no modifica el documento');
  await page.locator('#writer-fit').click();assert.equal(await page.locator('#writer-zoom').inputValue(),'fit');
  await page.locator('#writer-spelling').click();assert.equal(await page.evaluate(()=>PlanoWriter.view().dom.spellcheck),false);assert.equal(await page.evaluate(()=>state.proofreading.enabled),false);
  await page.evaluate(()=>{const v=PlanoWriter.view();v.dispatch(v.state.tr.insertText('Una nueva toma. ',v.state.doc.child(0).nodeSize+1));});assert.equal(await page.evaluate(()=>PlanoWriter.view().dom.spellcheck),false,'La opción se mantiene tras editar');
  await page.locator('#writer-spelling').click();assert.equal(await page.evaluate(()=>PlanoWriter.view().dom.spellcheck),true);
  await page.evaluate(()=>{const v=PlanoWriter.view(),flow=PlanoScreenplay.layout(v.state.doc.toJSON()),line=flow.pages[1].find(line=>!line.virtual);v.dispatch(v.state.tr.setSelection(PlanoProseMirror.TextSelection.create(v.state.doc,line.pos)));});
  assert((await page.locator('#writer-page-status').textContent()).startsWith('Página 2 de '));
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'barra-inferior-escritura.png')});
  await page.locator('#stage-tabs [data-stage=coverage]').click();await ready(page);await bottomBar(page,'.coverage-status');
  assert(await page.locator('.page-slot[data-ready=true] canvas').count(),'El zoom se prueba sobre páginas renderizadas');
  for(const id of ['#page-label','#zoom-in','#zoom-out','#fit-width','#coverage-zoom-range','#toggle-spelling','#save-status','#view-mode-button'])assert(await page.locator(id).evaluate(el=>Boolean(el.closest('footer.editor-status'))),'Control de cobertura al pie: '+id);
  assert.equal(await page.locator('#project-menu #toggle-spelling').count(),0);assert.equal(await page.locator('.annotation-toolbar .zoom-controls').count(),0);
  await page.locator('#coverage-zoom-range').evaluate(el=>{el.value='120';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});await ready(page);assert(Math.abs(await page.evaluate(()=>state.zoom)-1.2)<.01);
  await page.locator('#fit-width').click();await ready(page);assert(await page.evaluate(()=>state.fit));
  await page.locator('#view-mode-button').click();const menu=await page.locator('#view-mode-menu').boundingBox();assert(menu.y>=0&&menu.y+menu.height<=1000);await page.keyboard.press('Escape');
  await page.evaluate(()=>{state.annotations=validateNotes([{id:'status-shot',shotId:'status-shot',shotName:'P1',type:'line',page:2,color:'#e8b83f',start:{x:.8,y:.2},end:{x:.8,y:.4}}]);changed();});await ready(page);
  await page.locator('#pdf-stage').evaluate(el=>el.scrollTop=el.scrollHeight);await bottomBar(page,'.coverage-status');
  await page.screenshot({path:path.join(out,'barra-inferior-cobertura.png')});
  await page.locator('#stage-tabs [data-stage=technical]').click();await bottomBar(page,'.technical-status');
  for(const id of ['#technical-summary','#technical-edit-status'])assert(await page.locator(id).evaluate(el=>Boolean(el.closest('footer.editor-status'))));
  assert((await page.locator('#technical-summary').textContent()).includes('1 plano'));
  await page.locator('#stage-tabs [data-stage=writing]').click();await page.setViewportSize({width:390,height:844});await page.locator('#writer-fit').click();await bottomBar(page,'.writer-status');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const controls=await page.locator('.writer-status .status-zoom').boundingBox();assert(controls.x+controls.width<340,'Queda espacio para el icono de reportes');
  await page.evaluate(()=>message('Un aviso de prueba que debe dejar libres los controles inferiores.',true));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const alertBox=await page.locator('#feedback').boundingBox(),statusBox=await page.locator('.writer-status').boundingBox();assert(alertBox.y+alertBox.height<statusBox.y,'Los avisos aparecen encima de la barra');
  await page.locator('#writer-fit').click();await page.evaluate(()=>message(''));
  await page.screenshot({path:path.join(out,'barra-inferior-movil.png')});assert.deepEqual(errors,[]);
  console.log('OK: barra inferior por etapa, zoom con botones/deslizador/ajuste, ortografía real y persistente al editar, página/palabras, navegación, estado y móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
