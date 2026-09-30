const fs=require('fs'),path=require('path');
const sharp=require('sharp');
const dir=__dirname,root=path.resolve(dir,'../../../../../..');
const {crop}=JSON.parse(fs.readFileSync(path.join(dir,'crop.json')));
(async()=>{
  await sharp(path.join(dir,'torso-imagegen-raw.png')).resize(crop.width,crop.height,{kernel:'lanczos3'}).ensureAlpha().png().toFile(path.join(dir,'torso-part-native.png'));
  let svg='<svg width="920" height="708" xmlns="http://www.w3.org/2000/svg">';
  for(let x=40;x<490;x+=20)svg+=`<path d="M ${(x-crop.left)*2} 0 V 708" stroke="#008b87" stroke-opacity=".3"/><text x="${(x-crop.left)*2+2}" y="15" font-size="12" fill="#007b69">${x}</text>`;
  for(let y=260;y<606;y+=20)svg+=`<path d="M 0 ${(y-crop.top)*2} H 920" stroke="#008b87" stroke-opacity=".3"/><text x="2" y="${(y-crop.top)*2+15}" font-size="12" fill="#007b69">${y}</text>`;
  svg+='</svg>';
  const input=await sharp(path.join(dir,'torso-part-native.png')).resize(920,708,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
  await sharp(input).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'qa-generated-part-grid.png'));
  for(const [name,c] of [['left',{left:0,top:250,width:216,height:335}],['front',{left:165,top:249,width:230,height:210}],['right',{left:310,top:249,width:182,height:357}]]){
    const native=await sharp(path.join(root,'assets/chihaya_character/chi_b_@.png')).extract(c).resize(c.width*3,c.height*3,{kernel:'nearest'}).flatten({background:'#f3f0ec'}).png().toBuffer();
    let grid=`<svg width="${c.width*3}" height="${c.height*3}" xmlns="http://www.w3.org/2000/svg">`;
    for(let x=Math.ceil(c.left/10)*10;x<c.left+c.width;x+=10)grid+=`<path d="M ${(x-c.left)*3} 0 V ${c.height*3}" stroke="#008b87" stroke-opacity=".3"/><text x="${(x-c.left)*3+2}" y="12" font-size="10" fill="#007b69">${x}</text>`;
    for(let y=Math.ceil(c.top/10)*10;y<c.top+c.height;y+=10)grid+=`<path d="M 0 ${(y-c.top)*3} H ${c.width*3}" stroke="#008b87" stroke-opacity=".3"/><text x="2" y="${(y-c.top)*3+12}" font-size="10" fill="#007b69">${y}</text>`;
    grid+='</svg>';
    await sharp(native).composite([{input:Buffer.from(grid)}]).png().toFile(path.join(dir,`qa-source-${name}-detail.png`));
  }
  console.log(JSON.stringify({nativePart:[crop.width,crop.height],raw:await sharp(path.join(dir,'torso-imagegen-raw.png')).metadata()},null,2));
})();
