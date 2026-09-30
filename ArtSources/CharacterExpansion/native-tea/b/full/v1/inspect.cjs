const fs=require('fs'),path=require('path'),sharp=require('sharp');
const dir=__dirname;
(async()=>{
  const input=path.join(dir,'torso-imagegen-raw.png');
  console.log(await sharp(input).metadata());
  await sharp(input).resize(268,370,{kernel:'lanczos3'}).png().toFile(path.join(dir,'torso-part-native.png'));
  const panels=[];
  for(const name of ['torso-source-native.png','torso-part-native.png']) {
    panels.push(await sharp(path.join(dir,name)).resize(804,1110,{kernel:'nearest'}).flatten({background:'#202735'}).png().toBuffer());
  }
  const guide='<svg width="1638" height="1140" xmlns="http://www.w3.org/2000/svg">'+
    [0,1].map(col=>Array.from({length:19},(_,i)=>{
      const y=180+i*20,local=(y-180)*3+24;
      return `<line x1="${col*824+8}" y1="${local}" x2="${col*824+812}" y2="${local}" stroke="#f3bd5a" stroke-opacity=".42"/><text x="${col*824+12}" y="${local+13}" fill="#ffe299" font-size="12">y=${y}</text>`;
    }).join('')).join('')+'</svg>';
  await sharp({create:{width:1638,height:1140,channels:4,background:'#202735'}}).composite([{input:panels[0],left:8,top:24},{input:panels[1],left:832,top:24},{input:Buffer.from(guide)}]).png().toFile(path.join(dir,'qa-crop-registration.png'));
})();
