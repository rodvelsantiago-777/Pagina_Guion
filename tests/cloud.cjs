/* SQL real en PostgreSQL WASM, firma JWT real y navegador. Storage se simula en memoria.
 * No toca el proyecto Supabase del usuario, no crea cuentas y no envía correos. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PGlite}=require('../tools/node_modules/@electric-sql/pglite');
const load=name=>require(path.join(process.env.PLANO_RUNTIME_MODULES,name));
const {chromium}=load('playwright'),{PDFDocument,StandardFonts}=load('pdf-lib');
const root=path.resolve(__dirname,'..'),base='https://rodvelsantiago-777.github.io/Pagina_Guion/',endpoint='https://hoymkaxarjkgttkgocrn.supabase.co/functions/v1/plano-cloud';
(async()=>{
 const jose=await import(pathToFileURL(path.join(root,'tools/node_modules/jose/dist/webapi/index.js')).href);
 const {firebaseVerifier}=await import('../supabase/functions/plano-cloud/auth.mjs'),{createHandler}=await import('../supabase/functions/plano-cloud/handler.mjs');
 const db=new PGlite(),files=new Map(),keys=await jose.generateKeyPair('RS256'),jwtKeys=jose.createLocalJWKSet({keys:[await jose.exportJWK(keys.publicKey)]});
 const sign=async(uid,options={})=>new jose.SignJWT({email_verified:true,auth_time:Math.floor(Date.now()/1000),...options.claims}).setProtectedHeader({alg:'RS256'}).setSubject(uid).setIssuedAt().setExpirationTime(options.exp||'1h').setIssuer('https://securetoken.google.com/'+(options.project||'planos-15624')).setAudience(options.project||'planos-15624').sign(keys.privateKey);
 const tokens={ana:await sign('ana'),bob:await sign('bob')},verify=firebaseVerifier(jose,'planos-15624',jwtKeys);
 let failUpload=false,failRemove=false,failFinish=false,uploads=0;
 const rpc=async(owner,action,id,data)=>{if(failFinish&&action==='delete_finish')throw new Error('UNAVAILABLE');return(await db.query('select public.plano_cloud($1,$2,$3,$4::jsonb) as result',[owner,action,id,JSON.stringify(data)])).rows[0].result;};
 const preferences=async(owner,action,patch)=>(await db.query('select public.plano_preferences($1,$2,$3::jsonb) as result',[owner,action,JSON.stringify(patch)])).rows[0].result;
 const handler=createHandler({verify,rpc,preferences,origins:[new URL(base).origin],
  upload:async(owner,id,data)=>{if(failUpload)throw new Error('Storage unavailable');files.set(owner+'/'+id,new Uint8Array(data));uploads++;},
  download:async(owner,id)=>{const bytes=files.get(owner+'/'+id);if(!bytes)throw new Error('UNAVAILABLE');return new Blob([bytes],{type:'application/pdf'});},
  remove:async(owner,id)=>{if(failRemove)throw new Error('Storage unavailable');files.delete(owner+'/'+id);}
 });
 const send=async(action,data={},token=tokens.ana)=>handler(new Request(endpoint+'?action='+action,{method:'POST',headers:{Origin:new URL(base).origin,Authorization:'Bearer '+token,...(!(data instanceof FormData)?{'Content-Type':'application/json'}:{})},body:data instanceof FormData?data:JSON.stringify(data)}));
 const json=async(action,data={},token=tokens.ana)=>{const response=await send(action,data,token);return{status:response.status,...await response.json()};};
 const create=async(bytes,name='Guion de prueba.pdf',token=tokens.ana)=>{const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),name);form.append('name',name);return json('create',form,token);};
 let browser;
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261021001829_plano_private_cloud.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const prefsMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_account_preferences.sql'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',prefsMigration),'utf8'));
  const libraryMigration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_library_previews.sql'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',libraryMigration),'utf8'));await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',libraryMigration),'utf8'));
  await db.exec('set role service_role');try{assert.equal(await preferences('ana','read',{}),null);}finally{await db.exec('reset role');}
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(db.query('select * from public.plano_preferences'),/permission denied/);await assert.rejects(db.query("select public.plano_preferences('ana','read')"),/permission denied/);}finally{await db.exec('reset role');}}
  assert.equal((await json('preferences_read',{},'')).status,401);
  assert.equal((await json('preferences_save',{patch:{mode:'dark',preset:'violet'},owner:'bob'})).status,200);
  assert.equal((await json('preferences_read',{},tokens.bob)).preferences,null,'El propietario del cuerpo no cambia la cuenta del token');
  assert.deepEqual((await json('preferences_save',{patch:{preset:'blue'}})).preferences,{mode:'dark',preset:'blue'});
  assert.deepEqual((await json('preferences_save',{patch:{mode:'light'}})).preferences,{mode:'light',preset:'blue'});
  for(const patch of [{},{mode:'auto'},{preset:'custom'},{mode:null},{owner:'bob'},[]]){assert.equal((await json('preferences_save',{patch})).status,400);await assert.rejects(preferences('ana','save',patch),/INVALID_INPUT/);}
  await db.exec('truncate public.plano_preferences,public.plano_usage');
  await db.exec('set role service_role');try{assert.deepEqual((await rpc('ana','list',null,{})).projects,[],'El servidor ejecuta la función con sus permisos, sin SECURITY DEFINER');}finally{await db.exec('reset role');}
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);try{await assert.rejects(db.query('select * from public.plano_projects'),/permission denied/);await assert.rejects(db.query("select public.plano_cloud('ana','list')"),/permission denied/);}finally{await db.exec('reset role');}
  }
  assert.equal((await json('list',{},'')).status,401);
  assert.equal((await json('list',{},await sign('ana',{project:'other-project'}))).status,401);
  assert.equal((await json('list',{},await sign('ana',{claims:{email_verified:false}}))).status,401);
  assert.equal((await json('list',{},await sign('ana',{exp:'-1h'}))).status,401);
  assert.equal((await json('list',{},tokens.ana.slice(0,-8)+'tampered')).status,401);
  const denied=await handler(new Request(endpoint+'?action=list',{method:'POST',headers:{origin:'https://untrusted.invalid',authorization:'Bearer '+tokens.ana},body:'{}'}));assert.equal(denied.status,403);
  const initial=await create(Buffer.from('%PDF-1.7\nfixture'));assert.equal(initial.status,200);const project=initial.project;
  assert.equal((await json('read',{id:project.id},tokens.bob)).status,404);
  assert.equal((await json('download',{id:project.id},tokens.bob)).status,404);
  assert.equal((await json('delete',{id:project.id,revision:0},tokens.bob)).status,404);
  assert.equal((await json('save',{id:project.id,revision:0,payload:{version:1,annotations:[]}},tokens.bob)).status,404);
  assert.equal((await create(Buffer.from('%PDF-1.7\nfixture'))).project.id,project.id);assert.equal(uploads,1);
  const payload={version:1,annotations:[{id:'note',type:'line',shotName:'Plano A'}]};
  const concurrent=await Promise.all([json('save',{id:project.id,revision:0,payload}),json('save',{id:project.id,revision:0,payload:{version:1,annotations:[]}})]);
  assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
  failRemove=true;assert.equal((await json('delete',{id:project.id,revision:1})).status,503);failRemove=false;
  assert.equal((await json('read',{id:project.id})).project.state,'ready');
  failFinish=true;assert.equal((await json('delete',{id:project.id,revision:1})).status,503);failFinish=false;
  assert.equal((await json('delete',{id:project.id,revision:1})).status,200,'Se recupera un borrado interrumpido después de eliminar el objeto');
  failUpload=true;const failed=await create(Buffer.from('%PDF-1.7\nfallida'));assert.equal(failed.code,'UPLOAD_FAILED');failUpload=false;
  const pending=(await json('list')).projects[0];assert.equal(pending.state,'pending');assert.equal((await json('delete',{id:pending.id,revision:0})).status,200);
  assert.equal((await create(new Uint8Array(10485761))).status,413);
  assert.equal((await create(Buffer.from('not a pdf'))).status,400);
  await db.exec('truncate public.plano_projects,public.plano_usage');files.clear();uploads=0;
  // Límites aplicados por SQL, independientes de los controles del navegador.
  for(let i=0;i<10;i++)await rpc('ana','reserve',null,{name:'Limite.pdf',fingerprint:i.toString(16).padStart(64,'0'),size_bytes:8});
  await assert.rejects(rpc('ana','reserve',null,{name:'Otro.pdf',fingerprint:'f'.repeat(64),size_bytes:8}),/USER_STORAGE_LIMIT/);
  await db.exec('truncate public.plano_projects,public.plano_usage');
  for(let i=0;i<80;i++)await rpc('owner'+i,'reserve',null,{name:'Limite.pdf',fingerprint:i.toString(16).padStart(64,'0'),size_bytes:8});
  await assert.rejects(rpc('new-owner','reserve',null,{name:'Otro.pdf',fingerprint:'f'.repeat(64),size_bytes:8}),/GLOBAL_STORAGE_LIMIT/);
  await db.exec("update public.plano_usage set transfer_bytes=3000000000 where owner_id='*'");
  await assert.rejects(rpc('ana','list',null,{}),/GLOBAL_MONTH_LIMIT/);
  await db.exec('truncate public.plano_projects,public.plano_usage');
  console.log('OK servidor: firmas JWT, verificación de correo, RLS, separación de cuentas, revisiones, cuotas, deduplicación y recuperación de subidas/borrados interrumpidos.');

  browser=await chromium.launch(process.env.PLANO_BROWSER==='brave'?{executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true}:{channel:'msedge',headless:true});
  const errors=[];
  async function newDevice(owner='ana',options={}){
   const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
   if(options.initialSettings)await page.addInitScript(settings=>localStorage.setItem('plano-appearance-v2',JSON.stringify(settings)),options.initialSettings);
   await page.route(base+'**',route=>{
    const relative=decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(base).pathname.length))||'index.html';
    if(relative==='accounts.js')return route.fulfill({contentType:'text/javascript',body:`globalThis.PlanoAccounts={ready:Promise.resolve(),getUser:()=>({id:${JSON.stringify(owner)},email:'prueba@example.invalid'}),getAccessToken:async()=>${JSON.stringify(tokens[owner])},notesKey:f=>'plano-notes-user-v1:${owner}:'+f,connectWorkspace:hooks=>{globalThis.cloudTestHooks=hooks;hooks.change(${JSON.stringify(owner)});},open:()=>{}};document.body.classList.remove('auth-locked');document.querySelector('#auth-entry').hidden=true;document.querySelector('.app-shell').inert=false;`});
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.route(endpoint+'**',async route=>{
    const request=route.request();const response=await handler(new Request(request.url(),{method:request.method(),headers:request.headers(),body:request.postDataBuffer()||undefined}));
    if(request.url().includes('action=preferences_read')&&options.holdRead)await options.holdRead;
    if(request.url().includes('action=list')){options.onList?.();if(options.holdList)await options.holdList;}
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
   });
   await page.goto(base);await page.waitForFunction(()=>globalThis.PlanoCloudLibrary&&PlanoCloud.info().owner);
   return{page,context};
  }
  // Dos dispositivos recuperan tema y modo sin tener que subir un PDF.
  const legacy=await newDevice('ana',{initialSettings:{mode:'dark',preset:'red'}});await legacy.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'red'},'La primera cuenta adopta la personalización anterior si aún no tiene una en la nube');await legacy.context.close();await db.exec('truncate public.plano_preferences,public.plano_usage');
  const appearanceOne=await newDevice();await appearanceOne.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  await appearanceOne.page.locator('#toggle-theme').click();await appearanceOne.page.locator('#open-appearance').click();await appearanceOne.page.locator('[data-appearance-preset=violet]').click();
  await appearanceOne.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'violet'});
  const appearanceTwo=await newDevice();await appearanceTwo.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await appearanceTwo.page.evaluate(()=>PlanoAppearance.get()),{mode:'dark',preset:'violet'});
  await appearanceTwo.page.locator('#open-appearance').click();assert((await appearanceTwo.page.locator('#appearance-dialog').boundingBox()).width<=280);assert.equal(await appearanceTwo.page.locator('#appearance-sync').textContent(),'Tema guardado en tu cuenta');await appearanceTwo.page.screenshot({path:path.join(root,'tests/.output/apariencia-cuenta.png')});await appearanceTwo.page.locator('#close-appearance').click();
  await appearanceTwo.context.setOffline(true);await appearanceTwo.page.locator('#toggle-theme').click();await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.flush());assert.equal(await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.info().status),'error');
  await appearanceTwo.context.setOffline(false);await appearanceTwo.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'violet'});
  await appearanceTwo.page.locator('#toggle-theme').click();await appearanceTwo.page.evaluate(()=>PlanoAccountAppearance.flush());
  await appearanceOne.context.setOffline(true);await appearanceOne.page.locator('#toggle-theme').click();await appearanceOne.page.evaluate(()=>PlanoAccountAppearance.flush());
  assert.equal(await appearanceOne.page.evaluate(()=>PlanoAccountAppearance.info().status),'error');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'dark',preset:'violet'});
  // El pendiente sobrevive al cierre de la pestaña, siempre asociado al UID.
  const offlineCache=await appearanceOne.page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('plano-appearance'))));
  await appearanceOne.context.close();
  const restored=await newDevice('ana');await restored.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  await restored.page.evaluate(values=>{for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);},offlineCache);
  await restored.page.reload();await restored.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'violet'});
  // Una lectura lenta no revierte elecciones nuevas.
  let release;const held=new Promise(resolve=>release=resolve),slow=await newDevice('ana',{holdRead:held});
  await slow.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='loading');
  await slow.page.locator('#open-appearance').click();await slow.page.locator('[data-appearance-preset=blue]').click();release();
  await slow.page.waitForFunction(()=>PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'blue'});
  // Cambiar de cuenta con una lectura pendiente no aplica el tema anterior.
  let releaseOld;const oldHeld=new Promise(resolve=>releaseOld=resolve),switcher=await newDevice('ana',{holdRead:oldHeld});
  await switcher.page.waitForFunction(()=>PlanoAccountAppearance?.info().status==='loading');
  await switcher.page.evaluate(async token=>{await cloudTestHooks.change('bob');PlanoAccounts.getUser=()=>({id:'bob'});PlanoAccounts.getAccessToken=async()=>token;document.dispatchEvent(new CustomEvent('plano-account-change'));},tokens.bob);
  releaseOld();await switcher.page.waitForFunction(()=>PlanoAccountAppearance.info().owner==='bob'&&PlanoAccountAppearance.info().status==='saved');
  assert.deepEqual(await switcher.page.evaluate(()=>PlanoAppearance.get()),{mode:'light',preset:'default'});
  await switcher.page.locator('#toggle-theme').click();await switcher.page.evaluate(()=>cloudTestHooks.beforeChange());
  assert.deepEqual(await preferences('bob','read',{}),{mode:'dark',preset:'default'},'Cerrar sesión termina el guardado de apariencia');
  assert.deepEqual(await preferences('ana','read',{}),{mode:'light',preset:'blue'});
  for(const device of [appearanceTwo,restored,slow,switcher])await device.context.close();
  await db.exec('truncate public.plano_usage');
  console.log('OK apariencia de cuenta: restauración entre dispositivos, validación, permisos, cambios durante carga, caché pendiente, cierre de sesión y cambio de propietario durante una lectura.');
  const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Courier),sheet=doc.addPage([595,842]);sheet.drawText('INT. ESTUDIO - DIA',{x:65,y:770,size:12,font});sheet.drawText('La historia comienza.',{x:65,y:700,size:12,font});
  const continuation=doc.addPage([595,842]);continuation.drawText('La historia continua.',{x:65,y:700,size:12,font});
  const pdf=Buffer.from(await doc.save()),one=await newDevice();
  await one.page.locator('#file-input').setInputFiles({name:'Historia.pdf',mimeType:'application/pdf',buffer:pdf});await one.page.waitForFunction(()=>state.cloudProject&&!state.busy);
  const id=await one.page.evaluate(()=>state.cloudProject.id);
  async function edit(page,name){
   await page.evaluate(name=>{state.annotations=[{id:'test-line',shotId:'test-line',type:'line',page:1,endPage:2,color:'#e8b83f',start:{x:.85,y:.2},end:{x:.85,y:.4},shotName:name,description:'Una descripción de prueba',grip:'Trípode',sound:'Ambiente',note:'Nota privada',scriptSelection:[{page:1,text:'La historia comienza.',rects:[{x:.11,y:.15,width:.3,height:.02}]}]}];changed();},name);
  }
  await edit(one.page,'Plano A');await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  await one.page.evaluate(()=>{state.annotations[0].labelUnrestricted=true;state.corrections=[PlanoCorrections.create([{page:1,text:'La historia comienza.',rects:[{x:.11,y:.15,width:.3,height:.02}]}],state.pdf.numPages)];changed();});await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  assert.equal(uploads,1,'Los cambios de notas no vuelven a subir el PDF');
  assert.equal(await one.page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('plano-notes'))),false,'Los cambios de nube no se guardan en el dispositivo');
  const two=await newDevice();await two.page.locator('#open-cloud').click();await two.page.getByRole('button',{name:'Historia.pdf',exact:true}).click();await two.page.waitForFunction(()=>state.cloudProject&&!state.busy);
  assert.equal(await two.page.evaluate(()=>state.annotations[0].shotName),'Plano A','Otro dispositivo recupera PDF y planos');assert.equal(await two.page.evaluate(()=>state.annotations[0].endPage),2,'La cuenta conserva la continuación entre páginas');
  assert.equal(await two.page.evaluate(()=>state.annotations[0].scriptSelection[0].text),'La historia comienza.','La cuenta conserva el fragmento vinculado a la línea');
  assert.equal(await two.page.evaluate(()=>state.annotations[0].labelUnrestricted),true,'La cuenta conserva el permiso de colocar el título sobre contenido');
  assert.equal(await two.page.evaluate(()=>state.corrections[0].parts[0].text),'La historia comienza.','Las correcciones editoriales se recuperan en otro dispositivo');
  await one.context.setOffline(true);await edit(one.page,'Sin conexión');await one.page.evaluate(()=>PlanoCloud.flush().catch(()=>{}));assert.equal(await one.page.evaluate(()=>PlanoCloud.info().status),'error');
  assert.equal((await rpc('ana','read',id,{})).payload.annotations[0].shotName,'Plano A');
  await assert.rejects(one.page.evaluate(()=>cloudTestHooks.beforeChange()),/Cloud save pending/,'No se cierra sesión fingiendo que se guardó');
  await one.context.setOffline(false);await one.page.waitForFunction(()=>PlanoCloud.info().status==='saved');
  await edit(two.page,'Cambios de otra pestaña');await two.page.evaluate(()=>PlanoCloud.flush().catch(()=>{}));
  assert.equal(await two.page.evaluate(()=>PlanoCloud.info().status),'conflict');assert.equal((await rpc('ana','read',id,{})).payload.annotations[0].shotName,'Sin conexión');
  await two.page.locator('#open-cloud').click();assert(await two.page.locator('#cloud-reload').isVisible());
  const download=two.page.waitForEvent('download');await two.page.locator('#cloud-export-draft').click();const backup=await download;assert(backup.suggestedFilename().endsWith('.json'));
  await two.page.locator('#cloud-reload').click();await two.page.waitForFunction(()=>state.annotations[0].shotName==='Sin conexión');
  await two.page.locator('#cloud-projects').getByRole('button',{name:'Renombrar'}).click();await two.page.getByRole('textbox',{name:'Nombre del proyecto'}).fill('Historia final.pdf');await two.page.locator('.cloud-rename').getByRole('button',{name:'Guardar',exact:true}).click();await two.page.getByRole('button',{name:'Historia final.pdf',exact:true}).waitFor();
  assert.equal(await two.page.locator('#file-name').textContent(),'Historia final.pdf');
  await two.page.locator('#close-cloud').click();
  // Renombrado desde el editor: conserva PDF, notas y nombre de las exportaciones.
  await two.page.locator('#rename-current-file').click();await two.page.locator('#rename-file-input').fill('Historia editada');await two.page.locator('#save-file-rename').click();await two.page.locator('#rename-file-dialog').waitFor({state:'hidden'});
  assert.equal(await two.page.locator('#file-name').textContent(),'Historia editada.pdf');assert.equal((await rpc('ana','read',id,{})).name,'Historia editada.pdf');assert.equal(await two.page.evaluate(()=>state.annotations[0].shotName),'Sin conexión');
  await two.page.locator('#editor-home').click();await two.page.locator('.script-card-name').filter({hasText:'Historia editada'}).waitFor();await two.page.locator('.script-card-preview img').waitFor();
  assert.equal(await two.page.locator('.script-card').count(),1);assert(await two.page.locator('#upload-button .new-script-plus').isVisible());
  assert.equal(await two.page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('data:image/jpeg'))),false,'Las miniaturas privadas no se escriben en localStorage');
  const summary=(await rpc('ana','list',null,{})).projects[0];assert(summary.thumbnail.startsWith('data:image/jpeg;base64,')&&summary.thumbnail.length<=20000);assert(!('payload'in summary),'La biblioteca no descarga todas las notas');
  await two.page.locator('.script-rename').click();await two.page.locator('#rename-file-input').fill('   ');await two.page.locator('#save-file-rename').click();assert(await two.page.locator('#rename-file-dialog').isVisible());
  await two.page.locator('#rename-file-input').fill('Guion desde el inicio');await two.page.locator('#save-file-rename').click();await two.page.locator('#rename-file-dialog').waitFor({state:'hidden'});await two.page.locator('.script-card-name').filter({hasText:'Guion desde el inicio'}).waitFor();assert.equal(await two.page.locator('#file-name').textContent(),'Guion desde el inicio.pdf');
  await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-claro.png'),fullPage:true});await two.page.locator('#toggle-theme').click();await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-oscuro.png'),fullPage:true});
  // Otro dispositivo recibe la miniatura sin volver a descargar el archivo.
  let releaseList,listCalls=0;const heldList=new Promise(resolve=>releaseList=resolve);
  const library=await newDevice('ana',{holdList:heldList,onList:()=>listCalls++});
  await library.page.evaluate(()=>{globalThis.concurrentLibraryReads=Promise.all([PlanoCloudLibrary.showHome(),PlanoCloudLibrary.showHome(),PlanoCloudLibrary.showHome()]);});
  releaseList();await library.page.evaluate(()=>concurrentLibraryReads);
  await library.page.locator('.script-card-preview img').waitFor();assert.equal(listCalls,1,'Las cargas simultáneas del inicio comparten una única petición a la biblioteca');
  assert.equal(await library.page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('action=download')).length),0);await library.context.close();
  // Guion antiguo sin miniatura: se prepara una vez y conserva sus anotaciones.
  const legacyDoc=await PDFDocument.create(),legacyFont=await legacyDoc.embedFont(StandardFonts.Courier);legacyDoc.addPage([595,842]).drawText('LA SIGUIENTE HISTORIA',{x:85,y:600,size:18,font:legacyFont});
  const legacyProject=(await create(Buffer.from(await legacyDoc.save()),'La siguiente historia.pdf')).project;await two.page.locator('#home-refresh').click();await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"] img`).waitFor();await two.page.evaluate(()=>PlanoCloudLibrary.finishPreview());
  assert((await rpc('ana','read',legacyProject.id,{})).payload.thumbnail.startsWith('data:image/jpeg;base64,'));assert.equal((await rpc('ana','read',legacyProject.id,{})).payload.annotations.length,0);
  await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-varios.png'),fullPage:true});
  // «+» abre el selector de archivo y las tarjetas abren el guion correspondiente.
  const chooser=two.page.waitForEvent('filechooser');await two.page.locator('#upload-button').click();await chooser;
  await two.page.locator(`.script-card[data-project-id="${id}"] .script-card-open`).click();await two.page.waitForFunction(()=>state.screen==='editor'&&!state.busy);assert.equal(await two.page.locator('#file-name').textContent(),'Guion desde el inicio.pdf');
  await two.page.locator('#editor-home').click();await two.page.locator(`.script-card[data-project-id="${legacyProject.id}"]`).waitFor();
  await two.page.setViewportSize({width:390,height:844});assert(await two.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await two.page.screenshot({path:path.join(root,'tests/.output/biblioteca-guiones-movil.png'),fullPage:true});
  await rpc('ana','delete_begin',legacyProject.id,{revision:(await rpc('ana','read',legacyProject.id,{})).revision});await rpc('ana','delete_finish',legacyProject.id,{});files.delete('ana/'+legacyProject.id);await two.page.locator('#home-refresh').click();
  await two.page.locator('#open-cloud').click();await two.page.locator('#cloud-projects .cloud-project').waitFor();
  const other=await newDevice('bob');await other.page.locator('#open-cloud').click();await other.page.locator('#cloud-empty').waitFor({state:'visible'});assert.equal(await other.page.locator('.cloud-project').count(),0);
  await two.page.screenshot({path:path.join(root,'tests/.output/proyectos-nube.png'),fullPage:true});
  await two.page.setViewportSize({width:390,height:844});assert.equal(await two.page.evaluate(()=>document.querySelector('#cloud-library').scrollWidth<=document.querySelector('#cloud-library').clientWidth+1),true);
  await two.page.locator('#cloud-projects').getByRole('button',{name:'Eliminar',exact:true}).click();await two.page.locator('#cloud-empty').waitFor({state:'visible'});assert.equal(files.size,0);assert.equal(await two.page.evaluate(()=>state.pdf),null);
  await one.page.evaluate(()=>{PlanoCloud.changeOwner('');closeDocument();});
  assert.deepEqual(errors,[]);
  console.log('OK navegador: subida, autoguardado, biblioteca con miniaturas entre dispositivos y guiones antiguos, sin copias locales, renombrado desde inicio/editor, +, apertura, desconexión/recuperación, conflicto sin sobrescritura, copia JSON, borrado, aislamiento entre cuentas y móvil.');
 }finally{if(browser)await browser.close();await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
