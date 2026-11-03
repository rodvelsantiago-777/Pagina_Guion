/* Escritura real con botones, atajos y autocompletado de teclado; sin cuentas ni servicios reales. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');
async function reset(page,kind,text=''){
 await page.evaluate(({kind,text})=>{const v=PlanoWriter.view(),P=PlanoProseMirror,node=v.state.schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',attrs:{id:crypto.randomUUID(),kind},...(text?{content:[{type:'text',text}]}:{})}]}),tr=v.state.tr.replaceWith(0,v.state.doc.content.size,node.content);tr.setSelection(P.TextSelection.atEnd(tr.doc));v.dispatch(tr);v.focus();},{kind,text});
}
const current=page=>page.evaluate(()=>{const s=PlanoWriter.view().state.selection;return{kind:s.$from.parent.attrs.kind,text:s.$from.parent.textContent,offset:s.$from.parentOffset};});
(async()=>{
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>globalThis.PlanoWriter&&globalThis.PlanoCloudLibrary);
  await page.evaluate(async()=>{const script=PlanoScreenplay.create('La próxima toma',PlanoAccounts.getUser());script.characters=['ANA','ALICIA','LUIS'];await createNativeScript(script);});
  assert.equal(await page.locator('#writer-kind').count(),0,'Se elimina el selector desplegable');
  assert.equal(await page.locator('[data-writer-kind]').count(),8);
  assert.equal(await page.locator('[data-writer-kind]:disabled').count(),8,'Los tipos se reservan para el cuerpo del guion');
  await page.locator('#writer-body-tab').click();
  const keys={scene:'Control+Alt+e',action:'Control+Alt+a',character:'Control+p',parenthetical:'Control+Alt+p',dialogue:'Control+Alt+d',transition:'Control+Alt+t',insert:'Control+Alt+i',section:'Control+Alt+s'};
  for(const [index,[kind,key]]of Object.entries(keys).entries()){
   await reset(page,'action','Texto de prueba.');await page.keyboard.press(key);assert.equal((await current(page)).kind,kind,'Atajo '+key);
   assert.equal(await page.locator(`[data-writer-kind="${kind}"]`).getAttribute('aria-pressed'),'true');
   await reset(page,'action','Texto de prueba.');await page.keyboard.press('Alt+'+(index+1));assert.equal((await current(page)).kind,kind,'Alternativa Alt+'+(index+1));
   await page.locator('[data-writer-kind="action"]').click();await page.locator(`[data-writer-kind="${kind}"]`).click();assert.equal((await current(page)).kind,kind,'Botón '+kind);
   assert((await page.locator(`[data-writer-kind="${kind}"]`).getAttribute('title')).includes('Alt+'+(index+1)));
  }
  await page.locator('#writer-title-tab').click();
  assert(await page.locator('#writer-project-title').evaluate(input=>{const e=new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true,cancelable:true});input.dispatchEvent(e);return!e.defaultPrevented;}),'Ctrl+P se captura solo al editar el cuerpo');
  await page.locator('#writer-body-tab').click();
  // La primera flecha elige el primer candidato, sin saltárselo ni mover el cursor.
  await reset(page,'character');await page.keyboard.insertText('A');await page.locator('#writer-suggestions').waitFor({state:'visible'});
  const first=await page.locator('#writer-suggestions [role=option]').first().textContent();
  assert.equal(await page.locator('#writer-suggestions [aria-selected=true]').count(),0);
  await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#writer-suggestions [aria-selected=true]').textContent(),first);
  await page.keyboard.press('ArrowDown');assert.notEqual(await page.locator('#writer-suggestions [aria-selected=true]').textContent(),first);
  await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.equal((await current(page)).text,first);
  await page.keyboard.press('Enter');assert.deepEqual(await current(page),{kind:'parenthetical',text:'',offset:0});
  await page.keyboard.insertText('en voz baja');await page.keyboard.press('Enter');assert.equal((await current(page)).kind,'dialogue');
  assert((await page.evaluate(()=>state.screenplay.doc.content.map(PlanoScreenplay.plain))).includes('en voz baja'));
  await page.keyboard.insertText('La cámara está lista.');await page.keyboard.press('Enter');assert.equal((await current(page)).kind,'action');
  await page.keyboard.insertText('Se abre la puerta.');await page.keyboard.press('Enter');assert.equal((await current(page)).kind,'action');
  await reset(page,'scene','INT. CASA - DÍA');await page.keyboard.press('Enter');assert.equal((await current(page)).kind,'action');
  await reset(page,'character','LUIS');await page.keyboard.press('Escape');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
  assert.equal((await current(page)).kind,'dialogue');assert(!await page.evaluate(()=>state.screenplay.doc.content.some(node=>node.attrs.kind==='parenthetical')),'Omitir la acotación no deja paréntesis vacíos');
  await page.keyboard.insertText('Primera línea.');await page.keyboard.press('Shift+Enter');assert.equal((await current(page)).kind,'dialogue');
  assert((await current(page)).text.includes('\n'),'Mayús+Enter mantiene el elemento actual');
  // La propuesta en mayúsculas y la opción del texto seleccionado admiten flecha abajo y Enter.
  await reset(page,'action');await page.keyboard.insertText('EXTRA');await page.getByRole('option',{name:'Marcar personaje «EXTRA»',exact:true}).waitFor();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert(await page.evaluate(()=>state.screenplay.characters.includes('EXTRA')));assert.equal((await current(page)).kind,'action');
  await reset(page,'action');await page.keyboard.insertText('OTRO');await page.locator('#writer-suggestions').waitFor({state:'visible'});await page.keyboard.press('Enter');
  assert(!await page.evaluate(()=>state.screenplay.characters.includes('OTRO')),'Enter sin elegir una propuesta continúa escribiendo');
  await reset(page,'action','Bea entra en la habitación.');
  await page.evaluate(()=>{const v=PlanoWriter.view();v.dispatch(v.state.tr.setSelection(PlanoProseMirror.TextSelection.create(v.state.doc,1,4)));});
  await page.locator('#writer-selection-actions').waitFor({state:'visible'});await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#writer-mark-character').getAttribute('aria-selected'),'true');await page.keyboard.press('Enter');
  assert(await page.evaluate(()=>state.screenplay.characters.includes('BEA')));
  assert(await page.evaluate(()=>state.screenplay.doc.content[0].content.some(piece=>piece.text==='Bea'&&piece.marks?.some(mark=>mark.type==='character'&&mark.attrs.name==='BEA'))));
  await reset(page,'action','La cámara espera.');await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');
  assert.equal((await current(page)).text,'La cámara espera.','Se conserva el historial de escritura');
  await page.locator('#writer-title-tab').click();assert.equal(await page.locator('[data-writer-kind]:disabled').count(),8);
  await page.locator('#writer-body-tab').click();await page.locator('[data-writer-kind="dialogue"]').click();
  await page.evaluate(()=>{document.querySelector('#writer-scroll').scrollTop=0;});
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'writer-type-toolbar.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('[data-writer-kind="section"]').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'La barra se desplaza sin ensanchar la página móvil');
  await page.locator('[data-writer-kind="section"]').click();assert.equal((await current(page)).kind,'section');
  await page.screenshot({path:path.join(out,'writer-type-toolbar-mobile.png')});assert.deepEqual(errors,[]);
  console.log('OK: ocho botones y atajos, Ctrl+P limitado al cuerpo, Enter contextual, acotación opcional, navegación y marcación con flechas/Enter, historial y móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
