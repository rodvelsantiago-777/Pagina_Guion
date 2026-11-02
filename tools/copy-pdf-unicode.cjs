/* Recursos locales opcionales de PDF: fontkit 1.1.1 y Liberation Mono 2.1.5. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const kit=process.argv[2],faces=process.argv[3];
if(!kit||!faces)throw Error('Uso: node tools/copy-pdf-unicode.cjs FONTKIT_DIR LIBERATION_TTF_DIR');
if(JSON.parse(fs.readFileSync(path.join(kit,'package.json'),'utf8')).version!=='1.1.1')throw Error('Se requiere @pdf-lib/fontkit 1.1.1.');
const bundle=path.join(kit,'dist/fontkit.umd.min.js'),source=fs.existsSync(bundle)?bundle:path.join(kit,'fontkit.umd.min.js'),fonts={};
for(const [key,name]of Object.entries({normal:'Regular',bold:'Bold',italic:'Italic',both:'BoldItalic'}))fonts[key]=fs.readFileSync(path.join(faces,`LiberationMono-${name}.ttf`)).toString('base64');
const output=path.resolve(__dirname,'../vendor'),runtime=`\n(function(root){'use strict';const data=${JSON.stringify(fonts)},cache=new Map();root.PlanoPdfUnicode={fontkit:root.fontkit,face(kind){if(!cache.has(kind)){const raw=atob(data[kind]);cache.set(kind,Uint8Array.from(raw,c=>c.charCodeAt(0)));delete data[kind];}return cache.get(kind);}};})(globalThis);\n`;
fs.writeFileSync(path.join(output,'pdf-unicode.js'),fs.readFileSync(source,'utf8')+runtime);
fs.copyFileSync(path.join(faces,'LICENSE'),path.join(output,'LICENSE-Liberation.txt'));
fs.writeFileSync(path.join(output,'LICENSE-fontkit.txt'),`@pdf-lib/fontkit 1.1.1 — Andrew Dillon, Devon Govett and contributors.
Upstream package and README declare the MIT license:
https://github.com/Hopding/fontkit#license
https://www.npmjs.com/package/@pdf-lib/fontkit/v/1.1.1

Includes pako: Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn (MIT).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`);
console.log('PDF Unicode generado: '+crypto.createHash('sha256').update(fs.readFileSync(path.join(output,'pdf-unicode.js'))).digest('hex'));
