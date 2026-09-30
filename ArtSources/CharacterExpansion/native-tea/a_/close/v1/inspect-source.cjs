// Visual aids for tracing the unchanged native hair contours; no game asset is edited.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
(async () => {
  const crop={left:0,top:240,width:454,height:366};
  const scale=2;
  let svg=`<svg width="908" height="732" xmlns="http://www.w3.org/2000/svg">`;
  for(let x=0;x<454;x+=20) svg+=`<path d="M ${x*scale} 0 V 732" stroke="#16a090" stroke-opacity=".35"/><text x="${x*scale+2}" y="15" font-size="12" fill="#007b69">${x}</text>`;
  for(let y=240;y<606;y+=20) svg+=`<path d="M 0 ${(y-240)*scale} H 908" stroke="#16a090" stroke-opacity=".35"/><text x="2" y="${(y-240)*scale+15}" font-size="12" fill="#007b69">${y}</text>`;
  svg+='</svg>';
  const native=await sharp(path.join(root,'assets/chihaya_character/chi_a_@.png')).extract(crop).resize(908,732,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
  await sharp(native).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'qa-source-hair-grid.png'));
})();
