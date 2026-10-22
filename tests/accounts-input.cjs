/* Regresión de escritura en Brave/Edge con perfiles temporales, sin cuentas ni correos reales.
 * No reproduce los datos de autocompletado ni las extensiones del perfil del usuario. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.join(process.env.PLANO_RUNTIME_MODULES,'playwright'));
const root=path.resolve(__dirname,'..'),base='https://rodvelsantiago-777.github.io/Pagina_Guion/';
const config={apiKey:'AIza'+'a'.repeat(35),authDomain:'plano-input-test.firebaseapp.com',projectId:'plano-input-test',appId:'1:123456789:web:123456abcdef'};
const brave=process.env.PLANO_BRAVE_EXE||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const targets=[{name:'Edge',channel:'msedge',headless:true}];
if(fs.existsSync(brave))targets.push({name:'Brave',executablePath:brave,headless:process.env.PLANO_INPUT_HEADFUL!=='1'});
else console.log('SKIP: Brave no está instalado; usa PLANO_BRAVE_EXE para indicar su ejecutable.');
(async()=>{
 fs.mkdirSync(path.join(__dirname,'.output'),{recursive:true});
 for(const {name,...options}of targets){
  const browser=await chromium.launch(options),errors=[],requests=[];
  let closing=false,unexpectedDisconnect=false;
  browser.on('disconnected',()=>{if(!closing)unexpectedDisconnect=true;});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   page.on('pageerror',error=>errors.push(error.message));page.on('crash',()=>errors.push('Cierre inesperado de la pestaña'));
   await page.route(base+'**',route=>{
    const relative=decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(base).pathname.length))||'index.html';
    if(relative==='auth-config.js')return route.fulfill({contentType:'text/javascript',body:'globalThis.PlanoAuthConfig='+JSON.stringify(config)});
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    const contentType={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType,body:fs.readFileSync(file)});
   });
   await page.route('https://identitytoolkit.googleapis.com/**',route=>{
    requests.push(route.request().postDataJSON());
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{code:400,message:'INVALID_LOGIN_CREDENTIALS'}})});
   });
   await page.goto(base);await page.evaluate(()=>PlanoAccounts.ready);
   assert.equal(await page.locator('#account-card').evaluate(card=>card.closest('dialog')),null,'El formulario de acceso no está en un diálogo');
   assert.equal(await page.locator('#account-dialog').evaluate(dialog=>dialog.open),false);
   const email=page.locator('#account-email');
   assert.equal(await email.getAttribute('autocomplete'),'off');assert.equal(await email.getAttribute('inputmode'),'email');
   await page.locator('#account-name').pressSequentially('Santiago de prueba',{delay:10});
   await page.evaluate(()=>{
    globalThis.inputMutations=[];
    globalThis.inputObserver=new MutationObserver(records=>inputMutations.push(...records.map(record=>record.type+':'+record.attributeName)));
    inputObserver.observe(document.querySelector('#account-card'),{subtree:true,attributes:true,childList:true,characterData:true});
   });
   await email.pressSequentially('san',{delay:180});
   assert.equal(await email.inputValue(),'san');assert.equal(await email.evaluate(input=>document.activeElement===input),true);
   await email.pressSequentially('tiago.de.prueba@example.invalid',{delay:25});
   await page.keyboard.press('Home');await page.keyboard.press('Delete');await page.keyboard.type('s');
   assert.equal(await email.inputValue(),'santiago.de.prueba@example.invalid');
   for(let i=0;i<6;i++){
    await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');
    await email.pressSequentially('san'+i+'@example.invalid',{delay:5});
   }
   assert.deepEqual(await page.evaluate(()=>{inputObserver.disconnect();return inputMutations;}),[],'Escribir no regenera ni modifica la estructura del formulario');
   await page.keyboard.press('Tab');assert.equal(await page.locator('#account-password').evaluate(input=>document.activeElement===input),true);
   await page.keyboard.type('Una clave larga de prueba');await page.locator('#account-confirm').pressSequentially('Una clave larga de prueba');
   for(const invalid of ['san','san@','san@@example.invalid','san @example.invalid']){
    await email.fill(invalid);await page.locator('#account-submit').click();
    assert.equal(await email.evaluate(input=>input.validity.customError),true,'Se rechaza el correo inválido: '+invalid);
   }
   assert.equal(requests.length,0,'No se consulta Firebase mientras se escribe ni con correos inválidos');
   await email.fill('santiago@example.invalid');assert.equal(await email.evaluate(input=>input.checkValidity()),true,'Se puede corregir el correo tras un error');
   await page.locator('[data-account-view="login"]').click();
   await email.fill('');await email.pressSequentially('santiago@example.invalid',{delay:20});
   await page.locator('#account-password').pressSequentially('Una clave larga de prueba');await page.locator('#account-submit').click();
   await page.waitForFunction(()=>document.querySelector('#account-message').textContent.includes('no son correctos'));
   assert.equal(requests.length,1);assert.equal(requests[0].email,'santiago@example.invalid');
   assert(await page.locator('#auth-entry').isVisible());assert(!(await page.locator('.app-shell').isVisible()));
   await page.screenshot({path:path.join(__dirname,'.output',`correo-${name.toLowerCase()}.png`),fullPage:true});
   assert.deepEqual(errors,[]);assert.equal(unexpectedDisconnect,false);
   console.log(`OK ${name}: «san», correo completo, edición repetida, Tab, formulario estable, validación y envío. Perfil temporal; Firebase simulado.`);
  }finally{closing=true;await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
