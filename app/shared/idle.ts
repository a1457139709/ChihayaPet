export type IdleContext = { visible: boolean; awake: boolean; clickThrough: boolean; chat: boolean; settings: boolean; input: string; busy: boolean; bubble: boolean };
export const idleAllowed = (c: IdleContext) => c.visible && c.awake && !c.clickThrough && !c.chat && !c.settings && !c.input && !c.busy && !c.bubble;
export const idleDelay = (frequency: number, random = Math.random) => {
  const [low, high] = frequency === 1 ? [60, 180] : frequency === 3 ? [600, 900] : [180, 420];
  return (low! + random() * (high! - low!)) * 1_000;
};
export class IdleCatalog {
  private recent: string[] = [];
  next(hour: number, random = Math.random): string {
    const greeting = hour >= 5 && hour < 11 ? '早上好。愿今天能有一件让你微笑的小事。' : hour < 14 && hour >= 11 ? '中午好。再忙，也请留一点时间好好吃饭。' : hour < 18 && hour >= 14 ? '下午好。若是有些疲倦，不妨先喝口水，稍稍歇一会儿。' : hour >= 18 && hour < 23 ? '晚上好。忙碌了一天，现在可以稍微放松些了。' : '夜已经深了。还有事情要做的话，也请照顾好自己。';
    const lines = [greeting, ...companionLines, ...gameLines, ...(hour >= 5 && hour < 11 ? ['早上好。', '……早上好。'] : hour >= 21 || hour < 5 ? ['晚安。', '贵安，祝你有个美好的夜晚。', '……我要睡了'] : [])];
    const available = lines.filter(l => !this.recent.includes(l));
    const line = available[Math.min(available.length - 1, Math.floor(random() * available.length))] ?? lines[0]!;
    this.recent.push(line); this.recent = this.recent.slice(-8); return line;
  }
}
const companionLines = [
  '今天有没有遇到什么有趣的小事？如果愿意，我很乐意听你说。', '不必急着把每件事都做得完美。慢慢来，也是一种认真。', '偶尔什么都不说，安静地待一会儿，也很好。', '如果有一段属于自己的闲暇，你想读书，还是出门散散步呢？',
  '一张小小的书签，能替人记住故事暂停的地方。下次翻开时，就像赴一个约。', '茶杯的杯柄虽小，却能让手指避开烫热的杯身。日常物品里的体贴，总是藏在细节中。', '红茶的香气不只有一种。有的轻柔，有的浓郁，倒像各有各的性格。', '给茶留一点慢慢变温的时间，也给自己留一点不必匆忙的时间吧。',
  '笔记本不一定要写满重要的事。记下一句喜欢的话，也值得。', '铅笔写下的字可以修改，这一点很温柔。第一次没有写好，也不必介意。', '说到花，干花与鲜花各有美感。一种留住形状，一种让人珍惜眼前。', '折伞收起来很小，打开却能替人挡住一场雨。是件让人安心的小物品呢。',
  '方糖会慢慢融进茶里。有些细小的好意，也是这样不声不响地留下来。', '如果今天过得不太顺利，也不必勉强自己立刻振作。我可以陪你坐一会儿。', '窗边读书、桌旁喝茶……只是想象这样的片刻，心情也会平静一点。', '喜欢的故事读到最后一页，总有些舍不得。你会立刻开始下一本吗？', '一封手写的信，连停顿和笔迹都能留下来。那份郑重，很动人。', '今天也辛苦了。那些别人没有注意到的努力，并不会因此失去意义。', '若是一直专注于一件事，不妨让视线离开屏幕片刻。等你回来，我们再聊。',
];
// Preserve the native catalog's verbatim game lines and source attribution.
// 08n:81285; 02n:196993; 05n:275464; 07n:119783; 08n:116547,116891,211326;
// 07n:93510; 08n:84702; 10k:25841. Morning: 01n:125095,227589; night: 08n:92423,212463;04n:101747.
const gameLines = ['贵安。', '那么，今天吃什么好呢……', '……啊，已经这个时间了', '在这个时间稍微休息一会儿，好像已经变成一种习惯了呢……', '……去看会书吧。', '真安静啊……', '那么，今天就悠然地喝着茶度过这段时间吧。', '插花……最能欣赏花朵的时候，是什么时候呢？', '……能开出漂亮的花就好了呢。', '不知道是不是因为发生了很多事的缘故，今年更加让人觉得时间过得很快呢。真的，就是一转眼啊'];
