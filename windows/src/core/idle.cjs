'use strict';
// Companion lines ported from Core/IdleSpeech.swift; generated dialogue is not game quotation.
const LINES=[
 '今天有没有遇到什么有趣的小事？如果愿意，我很乐意听你说。',
 '不必急着把每件事都做得完美。慢慢来，也是一种认真。',
 '偶尔什么都不说，安静地待一会儿，也很好。',
 '如果有一段属于自己的闲暇，你想读书，还是出门散散步呢？',
 '一张小小的书签，能替人记住故事暂停的地方。下次翻开时，就像赴一个约。',
 '茶杯的杯柄虽小，却能让手指避开烫热的杯身。日常物品里的体贴，总是藏在细节中。',
 '红茶的香气不只有一种。有的轻柔，有的浓郁，倒像各有各的性格。',
 '给茶留一点慢慢变温的时间，也给自己留一点不必匆忙的时间吧。',
 '笔记本不一定要写满重要的事。记下一句喜欢的话，也值得。',
 '铅笔写下的字可以修改，这一点很温柔。第一次没有写好，也不必介意。',
 '说到花，干花与鲜花各有美感。一种留住形状，一种让人珍惜眼前。',
 '折伞收起来很小，打开却能替人挡住一场雨。是件让人安心的小物品呢。',
 '方糖会慢慢融进茶里。有些细小的好意，也是这样不声不响地留下来。',
 '如果今天过得不太顺利，也不必勉强自己立刻振作。我可以陪你坐一会儿。',
 '窗边读书、桌旁喝茶……只是想象这样的片刻，心情也会平静一点。',
 '喜欢的故事读到最后一页，总有些舍不得。你会立刻开始下一本吗？',
 '一封手写的信，连停顿和笔迹都能留下来。那份郑重，很动人。',
 '今天也辛苦了。那些别人没有注意到的努力，并不会因此失去意义。',
 '若是一直专注于一件事，不妨让视线离开屏幕片刻。等你回来，我们再聊。'];
class IdleSpeech{
 constructor(random=Math.random){this.random=random;this.due=null;this.recent=[];}
 reset(){this.due=null;}
 next(hour=new Date().getHours()){
  const greeting=hour>=5&&hour<11?'早上好。愿今天能有一件让你微笑的小事。':hour<14&&hour>=11?'中午好。再忙，也请留一点时间好好吃饭。':hour<18&&hour>=14?'下午好。若是有些疲倦，不妨先喝口水，稍稍歇一会儿。':hour>=18&&hour<23?'晚上好。忙碌了一天，现在可以稍微放松些了。':'夜已经深了。还有事情要做的话，也请照顾好自己。';
  const choices=[greeting,...LINES].filter(x=>!this.recent.includes(x));const line=choices[Math.floor(this.random()*choices.length)];
  this.recent.push(line);this.recent=this.recent.slice(-8);return line;
 }
 tick(now,allowed,frequency){
  if(!allowed){this.reset();return null;}
  if(this.due===null){const [low,high]=({frequent:[60,180],normal:[180,420],quiet:[600,900]})[frequency]||[180,420];this.due=now+(low+this.random()*(high-low))*1000;return null;}
  if(now<this.due)return null;this.reset();return this.next();
 }
}
module.exports={IdleSpeech};
