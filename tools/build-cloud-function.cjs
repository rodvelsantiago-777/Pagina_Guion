/* Genera un único archivo para el editor de Edge Functions del panel de Supabase. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'supabase/functions/plano-cloud');
const auth=fs.readFileSync(path.join(folder,'auth.mjs'),'utf8').replace(/^export /gm,'');
const handler=fs.readFileSync(path.join(folder,'handler.mjs'),'utf8').replace(/^export /gm,'');
const index=fs.readFileSync(path.join(folder,'index.ts'),'utf8').replace(/^import .+ from '\.\/.*';\r?\n/gm,'');
const content='// Generado por node tools/build-cloud-function.cjs. No contiene secretos.\n'+index.split('\n')[0]+'\n'+auth+'\n'+handler+'\n'+index.split('\n').slice(1).join('\n');
fs.writeFileSync(path.join(root,'supabase/plano-cloud.deploy.ts'),content);
console.log('Generado: supabase/plano-cloud.deploy.ts');
