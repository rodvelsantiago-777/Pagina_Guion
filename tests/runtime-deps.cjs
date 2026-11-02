/* Dependencias de pruebas; nunca se publica ni modifica el runtime compartido. */
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const roots=[process.env.PLANO_TEST_DEPENDENCIES,process.env.PLANO_RUNTIME_MODULES,path.resolve(__dirname,'../tools/node_modules'),path.resolve(__dirname,'.output/check-deps')].filter(Boolean);
function entry(value,mode){if(typeof value==='string')return value;if(value&&typeof value==='object')for(const key of ['node',mode,'default']){const found=entry(value[key],mode);if(found)return found;}return null;}
function resolve(name,mode){for(const root of roots){try{return require.resolve(name,{paths:[root]});}catch{}try{const directory=path.join(root,name),pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')),main=entry(pkg.exports?.['.']||pkg.exports,mode)||pkg.main;if(main)return require.resolve(path.join(directory,main));}catch{}}throw Error('Falta la dependencia de pruebas '+name+'. Instálala o define PLANO_TEST_DEPENDENCIES.');}
module.exports={load:name=>require(resolve(name,'require')),import:name=>import(pathToFileURL(resolve(name,'import')).href)};
