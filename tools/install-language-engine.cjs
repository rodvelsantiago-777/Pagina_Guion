/* Recursos públicos fijados por versión e integridad. No ejecuta código de los paquetes. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const version='0.2.8',commit='819dc354224c9087ff486708adfd413ecb45f466';
const packages={
 'lingotweaker-wasm':'ln+DgUUlAxNlWYrWFHyYcppo+Wg44Q/tyfiX8oZpfRonvmxNR2xjfiZxJBqm5hC0jf06HYEpkcGRCG14qrcpJA==',
 'lingotweaker-data-es':'+UtZ+ufdqHQqlONigcgHhhAXhdNU4VBZNkTaTvQhAPktPYH5EZGaBGl34Qvpaj//0aHdpVGv2pT5/AfXUCedPw=='
};
const dest=path.resolve(__dirname,'../vendor/spanish-review',version),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function download(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}
async function unpack(name,integrity){
 const archive=await download(`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
 if(crypto.createHash('sha512').update(archive).digest('base64')!==integrity)throw Error('Integridad incorrecta: '+name);
 const tar=zlib.gunzipSync(archive),files=new Map();
 for(let pos=0;pos+512<=tar.length;){const header=tar.subarray(pos,pos+512),name=header.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim(),8)||0;if(!name)break;if(!Number.isSafeInteger(size)||size<0||pos+512+size>tar.length)throw Error('Archivo tar inválido');if(header[156]===0||header[156]===48)files.set(name,tar.subarray(pos+512,pos+512+size));pos+=512+Math.ceil(size/512)*512;}
 return files;
}
(async()=>{
 const [wasm,data]=await Promise.all(Object.entries(packages).map(([name,integrity])=>unpack(name,integrity)));
 const required=(files,name)=>{const value=files.get('package/'+name);if(!value)throw Error('Falta '+name);return value;};
 const pack=required(data,'packs/es.pack.gz'),manifest=JSON.parse(required(data,'manifest.json'));
 if(sha(pack)!==manifest.languages.es.pack.sha256)throw Error('Integridad incorrecta del paquete español');
 fs.mkdirSync(dest,{recursive:true});
 const outputs={'lt_wasm.js':required(wasm,'web/lt_wasm.js'),'engine.wasm.gz':zlib.gzipSync(required(wasm,'web/lt_wasm_bg.wasm'),{level:9}),'es.pack.gz':pack};
 for(const [file,bytes]of Object.entries(outputs))fs.writeFileSync(path.join(dest,file),bytes);
 for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md','upstream.json'])fs.writeFileSync(path.join(dest,file),await download(`https://raw.githubusercontent.com/fiduswriter/LingoTweaker/${commit}/${file}`));
 fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({version,source:`https://github.com/fiduswriter/LingoTweaker/tree/${commit}`,sourceArchive:`https://github.com/fiduswriter/LingoTweaker/archive/${commit}.tar.gz`,packages:Object.fromEntries(Object.entries(packages).map(([name,hash])=>[name,{version,integrity:'sha512-'+hash}])),upstream:manifest.upstream_commit,files:Object.fromEntries(Object.entries(outputs).map(([file,bytes])=>[file,{bytes:bytes.length,sha256:sha(bytes)}]))},null,2)+'\n');
 console.log('Motor local español '+version+': '+Object.values(outputs).reduce((sum,b)=>sum+b.length,0)+' bytes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
