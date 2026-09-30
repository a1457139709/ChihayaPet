'use strict';
// Code-generated leaf mark; no external artwork or system imaging tool needed.
const {deflateSync}=require('node:zlib');
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function icon(){
 const size=32,raw=Buffer.alloc((size*4+1)*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=x-15.5,dy=y-15.5;const leaf=((dx+dy)*0.72)**2/150+((dx-dy)*0.72)**2/48<1;
  const stem=Math.abs(x+y-32)<1.5&&x>6&&x<26;
  const offset=y*(size*4+1)+1+x*4;
  const rgba=stem?[102,65,95,255]:leaf?[137,156,124,255]:[0,0,0,0];raw.set(rgba,offset);
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
module.exports={icon};
