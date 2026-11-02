/* Dependencias fijadas en package.json y pnpm-lock.yaml. Ejecutar tras pnpm install --frozen-lockfile. */
const fs=require('node:fs'),path=require('node:path'),esbuild=require('./node_modules/esbuild');
const root=path.resolve(__dirname,'../..');
esbuild.buildSync({entryPoints:[path.join(__dirname,'entry.mjs')],bundle:true,minify:true,format:'iife',globalName:'PlanoProseMirror',target:['chrome110','firefox115','safari16'],legalComments:'inline',outfile:path.join(root,'vendor/writer-engine.js')});
const licenses=[];
const resolutionPaths=['prosemirror-model','prosemirror-commands','prosemirror-history','prosemirror-keymap'].map(name=>path.dirname(require.resolve(name)));
for(const name of ['prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-commands','prosemirror-history','prosemirror-keymap','prosemirror-transform','orderedmap','rope-sequence','w3c-keyname']){
 let dir=path.dirname(require.resolve(name,{paths:resolutionPaths}));while(!fs.existsSync(path.join(dir,'package.json')))dir=path.dirname(dir);
 const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
 licenses.push(name+' '+pkg.version+'\n'+fs.readFileSync(path.join(dir,'LICENSE'),'utf8'));
}
fs.writeFileSync(path.join(root,'vendor/LICENSE-writer-engine.txt'),licenses.join('\n\n'));
console.log('Motor de escritura local generado.');
