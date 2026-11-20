/* Historial real del navegador sobre alojamiento estático, sin rutas de servidor. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('./runtime-deps.cjs').load('playwright');
const directory=path.resolve(__dirname,'..'),requests=[];
const server=http.createServer((request,response)=>{
 requests.push(request.url);
 if(request.url==='/Pagina_Guion/anterior.html'){response.setHeader('Content-Type','text/html');response.end('<title>Anterior</title>');return;}
 const url=new URL(request.url,'http://localhost'),relative=decodeURIComponent(url.pathname).replace(/^\/Pagina_Guion\//,'');
 const file=path.resolve(directory,relative||'index.html');
 if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end('Missing');return;}
 response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
 response.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/Pagina_Guion/`;
 const browser=await require('./editor-auth-fixture.cjs').launch(chromium,{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  // Una página anterior permite verificar que el inicio no atrapa al usuario.
  await page.goto(base+'anterior.html');await page.goto(base);
  await page.waitForURL('**/#/proyectos');
  await page.goBack();await page.waitForURL('**/anterior.html');
  await page.goForward();await page.waitForURL('**/#/proyectos');
  const archive=await page.evaluate(()=>{
   const script=PlanoScreenplay.create('¿Quién es?');
   const p=(kind,text,id)=>({type:'paragraph',attrs:{kind,id},content:[{type:'text',text}]});
   script.doc.content=[p('scene','INT. CASA - NOCHE','scene'),p('action','Ángela abre la puerta.','action'),p('character','ÁNGELA','speaker'),p('dialogue','Hola.','dialogue')];
   return PlanoProjectArchive.stringify({name:script.title,documentName:'Historia.plano',payload:{version:1,screenplay:script,annotations:[],corrections:[],crew:{roles:[]},proofreading:{enabled:false,dictionary:'',ignored:[]}}});
  });
  await page.locator('#file-input').setInputFiles({name:'Historia.plano',mimeType:'application/json',buffer:Buffer.from(archive)});
  await page.waitForFunction(()=>state.screenplay&&!state.busy);
  await page.waitForURL('**/guion');
  await page.evaluate(()=>PlanoWriter.open(state.screenplay));
  const beforeSkip=page.url();await page.locator('.skip-link').evaluate(link=>link.click());
  assert.equal(page.url(),beforeSkip);assert.equal(await page.evaluate(()=>document.activeElement.id),'main-content');
  await page.locator('#editor-home').click();await page.waitForURL('**/#/proyectos');
  await page.locator('.script-card-open').click();
  const projectURL=page.url();assert.match(projectURL,/#\/proyectos\/local-/);
  await page.locator('#open-project-characters').click();await page.locator('#character-list .character-card').first().waitFor();
  const charactersURL=page.url();assert.match(charactersURL,/\/personajes$/);
  await page.getByRole('tab',{name:'Árbol de relaciones'}).click();await page.waitForURL('**/personajes/relaciones');
  const treeURL=page.url(),count=await page.evaluate(()=>history.length);
  await page.evaluate(()=>PlanoCloudLibrary.refreshProject());
  assert.equal(await page.evaluate(()=>history.length),count,'Actualizar contenido no añade pasos');
  await page.goBack();await page.waitForURL(charactersURL);await page.locator('#characters-cards-panel').waitFor({state:'visible'});
  await page.goBack();await page.waitForURL(projectURL);await page.locator('#project-overview').waitFor({state:'visible'});
  await page.goForward();await page.locator('#characters-cards-panel').waitFor({state:'visible'});
  await page.goForward();await page.locator('#characters-relations-panel').waitFor({state:'visible'});
  assert.equal(page.url(),treeURL);
  await page.locator('#characters-back').click();await page.locator('[data-project-stage=writing]').click();
  await page.waitForURL('**/guion');
  await page.locator('#writer-body-tab').click();await page.locator('.ProseMirror').press('Control+End');await page.locator('.ProseMirror').press('End');await page.keyboard.type(' Cambio conservado.');
  await page.locator('#stage-tabs [data-stage=coverage]').click();await page.waitForURL('**/cobertura');
  await page.locator('#stage-tabs [data-stage=technical]').click();await page.waitForURL('**/guion-tecnico');
  await page.goBack();await page.waitForFunction(()=>state.stage==='coverage');
  await page.goBack();await page.waitForFunction(()=>state.stage==='writing');
  await page.waitForFunction(()=>document.querySelector('.ProseMirror')?.textContent.includes('Cambio conservado'));
  // Un formulario abierto bloquea la salida y conserva el historial Adelante.
  await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='navigation-test-dialog';document.body.append(dialog);dialog.showModal();});
  const writerURL=page.url();await page.goBack();await page.waitForURL(writerURL);assert.equal(await page.evaluate(()=>state.stage),'writing');
  await page.evaluate(()=>document.querySelector('#navigation-test-dialog').remove());
  await page.goForward();await page.waitForFunction(()=>state.stage==='coverage');
  // Ráfaga: la última navegación decide la vista y no duplica entradas.
  await page.evaluate(()=>{addEventListener('popstate',()=>history.forward(),{once:true});history.back();});
  await page.waitForURL('**/cobertura');await page.waitForFunction(()=>state.stage==='coverage');
  // Cuenta y sus subsecciones forman parte del mismo historial.
  await page.evaluate(()=>{PlanoAccounts.setProfileName=()=>{};PlanoAccounts.setProfilePhoto=()=>{};PlanoAccountSession.request=async()=>({profile:{name:'Prueba',birthDate:'',company:''},sessions:[],capabilities:{password:true,deletion:true}});PlanoAccountCenter.open();});
  await page.waitForURL('**/cuenta/perfil');await page.waitForFunction(()=>document.querySelector('#account-center').getAttribute('aria-busy')!=='true');
  await page.locator('[data-account-section=security]').click();await page.waitForURL('**/cuenta/seguridad');
  await page.goBack();await page.locator('[data-account-pane=profile]').waitFor({state:'visible'});
  await page.goBack();await page.locator('#account-center').waitFor({state:'hidden'});assert.match(page.url(),/\/cobertura$/);
  await page.goForward();await page.locator('#account-center').waitFor({state:'visible'});
  await page.locator('#center-back').click();await page.waitForURL('**/#/proyectos');
  // Las rutas inválidas o de otro usuario no abren documentos ajenos.
  await page.evaluate(()=>location.hash='#/proyectos/no-existe/personajes');
  await page.waitForURL('**/#/proyectos');await page.locator('#project-overview').waitFor({state:'hidden'});
  await page.evaluate(()=>location.hash='#/proyectos/%E0%A4%A/guion');await page.waitForURL('**/#/proyectos');
  // Dos visitas a Inicio conservan sus posiciones aunque compartan dirección.
  const repeatedIndex=await page.evaluate(()=>history.state.planoNavigation.index);
  await page.locator('.script-card-open').click();await page.locator('#editor-home').click();
  await page.evaluate(()=>history.go(-2));await page.waitForFunction(value=>history.state?.planoNavigation?.index===value,repeatedIndex);
  await page.locator('.script-card-open').click();
  assert.equal(await page.evaluate(()=>history.state.planoNavigation.index),repeatedIndex+1);
  // Recarga y enlace directo con proyecto de cuenta: se resuelve tras listar.
  const remote={id:'project-test',state:'ready',name:'Historia.plano',project_name:'¿Quién es?',storage_kind:'editable',size_bytes:100,revision:1};
  const routeURL=base+'#/proyectos/project-test/personajes/relaciones';
  await page.route('**/accounts.js*',route=>route.fulfill({contentType:'text/javascript',body:`
   (function(){let user=null,resolve;globalThis.PlanoTestDisableSpelling=true;
    globalThis.PlanoAccounts={configured:true,ready:new Promise(done=>resolve=done),getUser:()=>user,notesKey:key=>'test:'+key,connectWorkspace:()=>{},open:()=>{},setProfileName:()=>{},setProfilePhoto:()=>{}};
    document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
     user={id:'editor-test',name:'Prueba',email:'editor@example.invalid'};
     document.body.classList.remove('auth-locked');document.querySelector('#auth-entry').hidden=true;document.querySelector('.app-shell').inert=false;
     resolve();document.dispatchEvent(new CustomEvent('plano-account-change'));
    },80));
   })();`}));
  await page.route('**/cloud-library.js*',route=>route.fulfill({contentType:'text/javascript',body:`
   Object.defineProperty(PlanoCloud,'configured',{value:true});
   PlanoCloud.changeOwner('editor-test');
   PlanoCloud.list=async()=>{await new Promise(resolve=>setTimeout(resolve,80));return {projects:[${JSON.stringify(remote)}]};};
   PlanoCloud.prefetch=()=>Promise.resolve({project:{...${JSON.stringify(remote)},payload:PlanoProjectArchive.parse(${JSON.stringify(archive)}).payload}});
  `+fs.readFileSync(path.join(directory,'cloud-library.js'),'utf8')}));
  await page.goto(base+'anterior.html');
  await page.goto(routeURL);await page.locator('#characters-relations-panel').waitFor({state:'visible'});await page.locator('.relations-node').first().waitFor();
  assert.equal(page.url(),routeURL);
  await page.reload();await page.locator('.relations-node').first().waitFor();assert.equal(page.url(),routeURL);
  assert(!requests.some(url=>url.includes('/personajes')||url.includes('/project-test')),'El servidor estático nunca recibe la ruta interna');
  assert.deepEqual(errors,[]);
  console.log('OK: Atrás/Adelante, proyectos, personajes/árbol, tres editores, texto conservado, cuenta, formularios protegidos, enlaces directos, recarga y rutas inválidas en alojamiento estático.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
