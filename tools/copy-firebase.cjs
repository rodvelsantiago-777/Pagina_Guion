/* Copia reproducible de los scripts oficiales, sin instalación de paquetes en la web. */
const fs=require('node:fs/promises'),path=require('node:path');
const version='12.19.0',destination=path.resolve(__dirname,'../vendor');
(async()=>{
 for(const name of ['firebase-app-compat.js','firebase-auth-compat.js']){
  const response=await fetch(`https://www.gstatic.com/firebasejs/${version}/${name}`);if(!response.ok)throw new Error(`No se pudo descargar ${name}: ${response.status}`);
  await fs.writeFile(path.join(destination,name),Buffer.from(await response.arrayBuffer()));
 }
 const license=await fetch('https://raw.githubusercontent.com/firebase/firebase-js-sdk/main/LICENSE');if(!license.ok)throw new Error('No se pudo obtener la licencia de Firebase.');await fs.writeFile(path.join(destination,'LICENSE-firebase.txt'),await license.text());
 console.log(`Firebase ${version}: app y auth compat copiados con licencia Apache-2.0.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
