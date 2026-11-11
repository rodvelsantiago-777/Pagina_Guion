/* Cabecera global, título vinculado con la portada y guardado sin modales. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'.output');
(async()=>{
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>/^https?:/.test(route.request().url())?route.abort():route.continue());await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>globalThis.PlanoHeader&&globalThis.PlanoCloudLibrary);
  const full='Una historia muy larga con personajes, recuerdos y una última oportunidad';
  await page.evaluate(async title=>{const s=PlanoScreenplay.create(title,PlanoAccounts.getUser());s.doc.content=[{type:'paragraph',attrs:{kind:'scene',id:crypto.randomUUID()},content:[{type:'text',text:'INT. ESTUDIO - DÍA'}]},{type:'paragraph',attrs:{kind:'action',id:crypto.randomUUID()},content:[{type:'text',text:'María prepara la siguiente toma.'}]}];await createNativeScript(s);},full);
  const file=await page.evaluate(()=>state.file.name);
  const label=await page.locator('#file-name').textContent();assert.equal(Array.from(label).length,32);assert(label.endsWith('...'));assert.equal(await page.locator('#file-name').getAttribute('title'),full);
  assert.equal(await page.locator('#rename-current-file,#file-size').count(),0);
  const wordmark=page.locator('#editor-home .home-wordmark');
  assert(await wordmark.isHidden());assert(await page.locator('#editor-home .brand-mark').isVisible());
  await page.locator('#file-name').click();assert(await page.locator('#project-title-input').isVisible());assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.locator('#project-title-input').inputValue(),full);await page.locator('#project-title-input').fill('Rodaje de María');await page.keyboard.press('Enter');await page.locator('#project-title-form').waitFor({state:'hidden'});
  assert.equal(await page.locator('#file-name').textContent(),'Rodaje de María');
  assert.equal(await page.evaluate(()=>state.file.name),file);
  assert.equal(await page.locator('#writer-project-title').inputValue(),'Rodaje de María');
  assert.equal(await page.evaluate(()=>state.screenplay.title),'Rodaje de María');
  await page.locator('#writer-project-title').fill('Desde la portada');
  await page.locator('#writer-project-title').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#file-name').textContent==='Desde la portada'&&!state.busy);
  assert.equal(await page.evaluate(()=>currentLibraryProject().project_name),'Desde la portada');
  await page.locator('#file-name').click();await page.locator('#project-title-input').fill('');await page.keyboard.press('Enter');assert(await page.locator('#project-title-input').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('#file-name').textContent(),'Desde la portada');
  await page.locator('#file-name').click();await page.locator('#project-title-input').fill('Proyecto final');await page.keyboard.press('Tab');await page.locator('#project-title-form').waitFor({state:'hidden'});assert.equal(await page.locator('#file-name').textContent(),'Proyecto final');
  await page.evaluate(()=>{PlanoAccounts.getUser=()=>({id:'editor-test',name:'María López',email:'maria@example.invalid'});PlanoHeader.refreshIdentity();});assert.equal(await page.locator('#header-avatar').textContent(),'ML');
  for(const id of ['#open-account','#toggle-theme','#open-appearance'])assert(await page.locator(id).evaluate(el=>Boolean(el.closest('#project-menu'))));
  const mode=await page.locator('html').getAttribute('data-theme');await require('./header-menu.cjs').open(page);await page.locator('#toggle-theme').click();assert.notEqual(await page.locator('html').getAttribute('data-theme'),mode);
  await require('./header-menu.cjs').open(page);await page.locator('#open-appearance').click();assert(await page.locator('#appearance-dialog').isVisible());const palette=await page.locator('#appearance-dialog').boundingBox();assert(palette.x>700,'El selector se abre junto al avatar');await page.keyboard.press('Escape');assert(await page.locator('#account-menu-toggle').evaluate(el=>el===document.activeElement));
  for(const stage of ['coverage','technical','writing']){await page.locator(`#stage-tabs [data-stage="${stage}"]`).click();assert.equal(await page.locator('#file-name').textContent(),'Proyecto final');}
  await page.locator('#editor-home').click();assert(await page.locator('#project-overview').isHidden());assert(await page.locator('#home-projects').isVisible());assert(await page.locator('#file-name').isHidden());assert(await page.locator('#account-menu-toggle').isVisible());
  assert(await wordmark.isVisible());
  assert.equal(await wordmark.textContent(),'PLANO');
  await page.locator('.script-card-open').click();
  assert(await wordmark.isVisible());
  assert(await page.locator('#file-name').isHidden());
  assert.equal(await page.locator('#page-title').textContent(),'Proyecto final');
  await page.setViewportSize({width:320,height:844});
  assert(await wordmark.isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#editor-home').click();
  assert(await page.locator('#home-projects').isVisible());
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.script-card-open').click();
  fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'cabecera-carpeta-plano.png')});
  await page.locator('[data-project-stage=writing]').click();await page.waitForFunction(()=>state.screen==='editor'&&!state.busy);
  assert(await wordmark.isHidden());
  for(const id of ['#open-cloud-library','#cloud-library','#menu-patch-notes','#rename-file-menu','#replace-button','#open-document'])assert.equal(await page.locator(id).count(),0,'Acceso retirado: '+id);
  // Componente de nube con latencia controlada. La escritura real se verifica en cloud.cjs.
  await page.evaluate(()=>{
   globalThis.headerTestSaves=0;const saved={configured:true,project:{id:'local'},status:'saved',error:''};
   PlanoHeader.init({project:()=>currentLibraryProject(),canSave:()=>true,save:async()=>{headerTestSaves++;await new Promise(resolve=>setTimeout(resolve,180));PlanoHeader.syncCloud(saved);}});
   PlanoHeader.syncCloud(saved);document.querySelector('#open-cloud').hidden=false;
  });
  assert(await page.locator('#open-cloud .cloud-mark-check').isVisible());await page.locator('#open-cloud').click();await page.waitForFunction(()=>document.querySelector('#open-cloud').dataset.syncState==='saving');assert(await page.locator('#open-cloud .cloud-mark-saving').isVisible());assert.equal(await page.locator('dialog[open]').count(),0);
  await page.waitForFunction(()=>document.querySelector('#open-cloud').dataset.syncState==='saved');assert.equal(await page.evaluate(()=>headerTestSaves),1);assert(await page.locator('#open-cloud .cloud-mark-check').isVisible());
  await page.evaluate(()=>PlanoHeader.syncCloud({configured:true,project:{id:'local'},status:'error',error:'Error de conexión de prueba'}));assert(await page.locator('#open-cloud .cloud-mark-error').isVisible());assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>PlanoHeader.syncCloud({configured:true,project:{id:'local'},status:'saved',error:''}));
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'cabecera-compacta.png')});
  for(const width of [1440,900,390,320]){await page.setViewportSize({width,height:844});assert(await page.locator('#editor-home .brand-mark').isVisible());assert(await page.locator('#account-menu-toggle').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.locator('#file-name').boundingBox(),cloud=await page.locator('#open-cloud').boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert(cloud.x>=box.x+box.width-1&&cloud.x-box.x-box.width<15,'La nube queda junto al nombre');assert(Math.abs((cloud.y+cloud.height/2)-(box.y+box.height/2))<5,'Título y nube comparten fila');}
  await require('./header-menu.cjs').open(page);const menu=await page.locator('.account-menu').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=320);await page.screenshot({path:path.join(out,'cabecera-cuenta-movil.png')});assert.deepEqual(errors,[]);
  console.log('OK: icono, título limitado y editable sin modal, archivo independiente, iniciales, opciones de cuenta/tema globales, nube con estados y guardado directo, móvil.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
