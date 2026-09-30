// Visual aids for tracing the unchanged native hair contours; no game asset is edited.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {PNG} = require('pngjs');
const dir = __dirname;
const root = path.resolve(dir, '../../../../../..');
(async () => {
  const crop={left:0,top:240,width:454,height:366};
  const scale=2;
  let svg=`<svg width="908" height="732" xmlns="http://www.w3.org/2000/svg">`;
  for(let x=0;x<454;x+=20) svg+=`<path d="M ${x*scale} 0 V 732" stroke="#16a090" stroke-opacity=".35"/><text x="${x*scale+2}" y="15" font-size="12" fill="#007b69">${x}</text>`;
  for(let y=240;y<606;y+=20) svg+=`<path d="M 0 ${(y-240)*scale} H 908" stroke="#16a090" stroke-opacity=".35"/><text x="2" y="${(y-240)*scale+15}" font-size="12" fill="#007b69">${y}</text>`;
  svg+='</svg>';
  const native=await sharp(path.join(root,'assets/chihaya_character/chi_a@.png')).extract(crop).resize(908,732,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
  await sharp(native).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'qa-source-hair-grid.png'));
  for (const [name, region] of [['left', {left:108,top:250,width:112,height:172}], ['right', {left:250,top:250,width:84,height:182}]]) {
    const z=5, width=region.width*z, height=region.height*z;
    let grid=`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    for(let x=0;x<region.width;x+=10)grid+=`<path d="M ${x*z} 0 V ${height}" stroke="#169b80" stroke-opacity=".3"/><text x="${x*z+1}" y="12" font-size="11" fill="#006b53">${x+region.left}</text>`;
    for(let y=0;y<region.height;y+=10)grid+=`<path d="M 0 ${y*z} H ${width}" stroke="#169b80" stroke-opacity=".3"/><text x="1" y="${y*z+12}" font-size="11" fill="#006b53">${y+region.top}</text>`;
    grid+='</svg>';
    const detail=await sharp(path.join(root,'assets/chihaya_character/chi_a@.png')).extract(region).resize(width,height,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
    await sharp(detail).composite([{input:Buffer.from(grid)}]).png().toFile(path.join(dir,`qa-source-${name}-detail.png`));
  }
  const original=PNG.sync.read(fs.readFileSync(path.join(root,'assets/chihaya_character/chi_a@.png')));
  const mask=PNG.sync.read(fs.readFileSync(path.join(dir,'original-hair-preservation-mask.png')));
  const locks=new PNG({width:454,height:606});
  for(let p=0;p<original.data.length;p+=4)if(mask.data[p+3])original.data.copy(locks.data,p,p,p+4);
  const region={left:108,top:260,width:230,height:160},z=3;
  let lockGrid='<svg width="690" height="480" xmlns="http://www.w3.org/2000/svg">';
  for(let x=0;x<230;x+=10)lockGrid+=`<path d="M ${x*z} 0 V 480" stroke="#36c7a6" stroke-opacity=".3"/><text x="${x*z+1}" y="12" font-size="10" fill="#3ce5c0">${x+108}</text>`;
  for(let y=0;y<160;y+=10)lockGrid+=`<path d="M 0 ${y*z} H 690" stroke="#36c7a6" stroke-opacity=".3"/><text x="1" y="${y*z+12}" font-size="10" fill="#3ce5c0">${y+260}</text>`;
  lockGrid+='</svg>';
  const locksView=await sharp(PNG.sync.write(locks)).extract(region).resize(690,480,{kernel:'nearest'}).flatten({background:'#2b3440'}).png().toBuffer();
  await sharp(locksView).composite([{input:Buffer.from(lockGrid)}]).png().toFile(path.join(dir,'qa-hair-mask.png'));
})();
