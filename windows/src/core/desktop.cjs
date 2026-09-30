'use strict';
const DEFAULT_PREFS=Object.freeze({style:'a',framing:'full',expression:'automatic',height:256,alwaysOnTop:true,clickThrough:false,animations:true,idleEnabled:true,idleFrequency:'normal',musicVolume:0.2,musicLoop:'list',musicAutoplay:true});
const STYLES={a:'冬服正面',a_:'夏服正面',b:'冬服侧身',b_:'夏服侧身',c:'米色便服',d:'粉色裙装',e:'体操服'};
function validatePreferences(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('偏好格式无效。');
 const choices={style:Object.keys(STYLES),framing:['full','close'],expression:['automatic','neutral','serious','smile','surprised'],idleFrequency:['frequent','normal','quiet'],musicLoop:['single','list']};
 const result={};
 for(const [key,value]of Object.entries(patch)){
  if(!(key in DEFAULT_PREFS))throw Error('未知偏好选项。');
  if(choices[key]){if(!choices[key].includes(value))throw Error('偏好选项无效。');}
  else if(key==='height'||key==='musicVolume'){
   const [min,max]=key==='height'?[240,480]:[0,1];
   if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('偏好数值超出范围。');
  }else if(typeof value!=='boolean')throw Error('偏好开关格式无效。');
  result[key]=value;
 }
 return result;
}
function intersection(a,b){return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
function clampBounds(bounds,areas){
 if(!areas.length)throw Error('没有可用屏幕。');
 const b={...bounds};
 if(!Number.isFinite(b.x)||!Number.isFinite(b.y)){b.x=areas[0].x+areas[0].width-b.width;b.y=areas[0].y+areas[0].height-b.height;}
 const area=areas.reduce((best,a)=>intersection(b,a)>intersection(b,best)?a:best,areas[0]);
 return {x:Math.round(Math.max(area.x,Math.min(b.x,area.x+area.width-b.width))),y:Math.round(Math.max(area.y,Math.min(b.y,area.y+area.height-b.height))),width:Math.round(Math.min(b.width,area.width)),height:Math.round(Math.min(b.height,area.height))};
}
function petBounds(variant,height,previous){
 const width=Math.ceil(variant.width/variant.height*height)+24,h=Math.round(height)+24;
 return {x:previous?previous.x+previous.width-width:NaN,y:previous?previous.y+previous.height-h:NaN,width,height:h};
}
function bubbleBounds(pet,variant,height,area){
 const scale=height/variant.height,width=Math.min(340,area.width),h=Math.min(210,area.height);
 const mouthY=pet.y+12+variant.speech.mouth[1]*scale;
 const right=pet.x+12+variant.speech.hairRight*scale+6;
 const side=right+width<=area.x+area.width?'right':'left';
 const x=side==='right'?right:pet.x+12+variant.speech.hairLeft*scale-width-6;
 return {...clampBounds({x,y:mouthY-85,width,height:h},[area]),side};
}
module.exports={DEFAULT_PREFS,STYLES,validatePreferences,clampBounds,petBounds,bubbleBounds};
