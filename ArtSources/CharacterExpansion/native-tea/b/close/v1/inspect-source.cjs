const fs=require('fs'),path=require('path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'../../../../../..');
const original=JSON.parse(fs.readFileSync(path.join(root,'ArtSources/CharacterExpansion/native-tea/originals.json'))).variants['b/close'];
(async()=>{
 const grid=['<svg xmlns="http://www.w3.org/2000/svg" width="1016" height="708">'];
 for(let x=0;x<=508;x+=20) grid.push(`<path d="M${x*2},0 V708" stroke="#0088dd" stroke-opacity=".55"/><text x="${x*2+2}" y="17" fill="#0065bb" font-size="13">${x}</text>`);
 for(let y=252;y<606;y+=20) grid.push(`<path d="M0,${(y-252)*2} H1016" stroke="#dd2a77" stroke-opacity=".55"/><text x="3" y="${(y-252)*2+16}" fill="#bd0055" font-size="13">${y}</text>`);
 grid.push('</svg>');
 await sharp(path.join(root,original.body)).extract({left:0,top:252,width:508,height:354}).resize(1016,708,{kernel:'nearest'}).flatten({background:'#f6f2eb'}).composite([{input:Buffer.from(grid.join(''))}]).png().toFile(path.join(__dirname,'qa-source-hair-grid.png'));
 const faces=[];
 for(let i=0;i<original.faces.length;i++) faces.push({input:await sharp(path.join(root,original.faces[i].path)).flatten({background:'#f6f2eb'}).png().toBuffer(),left:10+i*213,top:28});
 const labels=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="225">'+original.faces.map((f,i)=>`<text x="${10+i*213}" y="19" font-size="16" fill="#333">原脸 ${f.id}</text>`).join('')+'</svg>');
 await sharp({create:{width:1500,height:225,channels:4,background:'#e9e5df'}}).composite([...faces,{input:labels}]).png().toFile(path.join(__dirname,'qa-original-face-index.png'));
 console.log('Original torso grid and seven unchanged original expressions are ready.');
})();
