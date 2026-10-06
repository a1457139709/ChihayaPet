import { setupDemoPlayback } from "./media.js";
const pages = { home: "\u9996\u9875", conversation: "\u82B1\u95F4\u7D6E\u8BED", wardrobe: "\u955C\u524D\u65F6\u5149" };
const costumes = ["\u590F\u5B63\u6821\u670D", "\u6DE1\u7C73\u8272\u957F\u88D9", "\u84DD\u767D\u793C\u670D"];
const outfitIds = ["a_", "c", "blue-white-rose"];
const faceIds = ["01", "03", "05", "09", "11"];
const expressions = ["\u6D45\u7B11", "\u60CA\u8BB6", "\u51DD\u601D", "\u4F4E\u7709", "\u6E29\u67D4"];
let costume = 0, expression = 0, cleanupPlayback = () => {
};
function currentPage() {
  const value = new URLSearchParams(location.search).get("page");
  return Object.hasOwn(pages, value) ? value : "home";
}
const head = (en, title, sub) => `<div class="page-head"><p class="eyebrow">${en}</p><h1 tabindex="-1">${title}</h1><p class="sub">${sub}</p></div>`;
function blossom(x, y, r, color = "#dec1d3") {
  return `<g transform="translate(${x} ${y})">${Array.from({ length: 7 }, (_, i) => `<ellipse cx="0" cy="-${r * 0.5}" rx="${r * 0.37}" ry="${r * 0.65}" transform="rotate(${i * 360 / 7})" fill="${color}" stroke="#a06f91" stroke-opacity=".3" stroke-width=".7"/>`).join("")}<circle r="${r * 0.2}" fill="#f6f0d9" stroke="#a99583" stroke-width=".7"/>${Array.from({ length: 6 }, (_, i) => `<circle cx="${Math.cos(i) * r * 0.13}" cy="${Math.sin(i) * r * 0.13}" r="1.5" fill="#b1a080"/>`).join("")}</g>`;
}
function spray(cls = "") {
  return `<div class="botanical ${cls}" aria-hidden="true"><svg viewBox="0 0 400 490" fill="none"><g stroke="#89968e" stroke-width="1.3"><path d="M30 480C185 367 115 180 349 38M62 442C170 371 249 389 356 264M122 363C69 288 72 193 34 132M172 215C231 201 270 155 283 85M204 173C161 127 173 79 144 24"/>${[[98, 391, -30], [122, 329, 20], [140, 269, -15], [177, 213, 45], [227, 145, 24], [279, 100, 40], [189, 377, 63], [258, 344, 35], [306, 303, 50], [93, 266, -40], [79, 215, -38], [180, 126, -45]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0C-53-14-42-64-18-83C10-62 25-23 0 0" fill="#bac9b3" fill-opacity=".8"/><path d="M0 0Q-11-44-18-83" stroke="#7f927f" stroke-opacity=".6"/><path d="M-9-35L-29-49M-12-50L1-62" stroke-opacity=".4"/></g>`).join("")}</g>${blossom(119, 320, 45, "#e3ccd9")}${blossom(194, 205, 36, "#f8f5e8")}${blossom(76, 405, 52, "#eee2e9")}${blossom(295, 107, 26, "#d5b7cc")}${blossom(282, 331, 30, "#fffaf0")}${blossom(152, 95, 23, "#e7d0df")}<path d="M45 467Q165 424 190 310" stroke="#a06f91" stroke-width="1"/><path d="M55 469Q93 474 137 440" stroke="#a06f91" stroke-width="1"/></svg></div>`;
}
const demoClips = [
  { title: "\u5F85\u673A\u76F8\u4F34", caption: "\u5B89\u9759\u5F85\u5728\u684C\u9762\uFF0C\u966A\u4F60\u5EA6\u8FC7\u65E5\u5E38\u3002", icon: "sun", src: null },
  { title: "\u70B9\u51FB\u6253\u5F00\u804A\u5929", caption: "\u8F7B\u70B9\u5343\u65E9\uFF0C\u6253\u5F00\u4F60\u4EEC\u7684\u5BF9\u8BDD\u3002", icon: "chat", src: null },
  { title: "\u62D6\u62FD\u79FB\u52A8", caption: "\u62D6\u52A8\u4EBA\u7269\uFF0C\u627E\u5230\u559C\u6B22\u7684\u4F4D\u7F6E\u3002", icon: "move", src: null },
  { title: "\u4E3B\u52A8\u95F2\u8BDD", caption: "\u5076\u5C14\u4E00\u53E5\u95EE\u5019\uFF0C\u4E3A\u65E5\u5E38\u6DFB\u70B9\u6E29\u67D4\u3002", icon: "leaf", src: null }
];
function featureIcon(name) {
  const paths = { sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>', chat: '<path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M7 9h8m-8 4h5"/>', move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>', leaf: '<path d="M20 3C5 2 1 10 6 17s17 3 14-14Z"/><path d="M3 22 16 9M9 16v-5m0 5h5"/>', dress: '<path d="m8 3 4 2 4-2 2 5-4 2 6 11H4l6-11-4-2 2-5Z"/>', face: '<circle cx="12" cy="12" r="9"/><path d="M8 9v1m8-1v1m-8 5q4 4 8 0"/>', music: '<path d="M9 18V5l11-3v13M9 8l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
}
function DemoCard(d, i) {
  return `<article class="demo-card"><div class="demo-media">${d.src ? `<video muted loop playsinline controls preload="metadata" aria-label="${d.title}\u771F\u5B9E\u5F55\u5C4F"><source src="${d.src}" type="video/webm"></video>` : `<div class="demo-empty">${featureIcon(d.icon)}<span>\u771F\u5B9E\u5F55\u5C4F\u5F85\u8865\u5145</span><small>\u9759\u97F3\u5FAA\u73AF \xB7 WebM</small></div>`}</div><div class="demo-caption"><span class="demo-number">0${i + 1}</span><div><h3>${d.title}</h3><p>${d.caption}</p></div></div></article>`;
}
function GardenHome() {
  return `<section class="showcase-home"><div class="home-artwork"><img src="assets/hero.png" alt="\u5983\u5BAB\u5343\u65E9\u7F8E\u56FE" width="205" height="115">${spray("artwork-flowers")}</div><p class="asset-note">\u9996\u9875\u56FE\u7247\u4E3A\u4F4E\u6E05\u9884\u89C8\uFF0C\u9AD8\u6E05\u56FE\u5F85\u8865\u5145\u3002</p><div class="home-content"><div class="showcase-intro"><p class="eyebrow">CHIHAYA \xB7 ALWAYS BY YOUR SIDE</p><h1>\u5983\u5BAB\u5343\u65E9</h1><p class="sub">\u8BA9\u5E73\u5E38\u7684\u65E5\u5B50\uFF0C\u591A\u4E00\u4EFD\u76F8\u4F34\u3002</p><a class="home-project-link" href="https://github.com/a1457139709/ChihayaPet" target="_blank" rel="noreferrer">\u8BA9\u76F8\u4F34\uFF0C\u4ECE\u8FD9\u91CC\u5F00\u59CB <span aria-hidden="true">\u2197</span></a></div><section class="paper-section demonstrations" aria-labelledby="demo-title">${spray("panel-flower")}<div class="section-heading"><div><p class="eyebrow">01 / LITTLE MOMENTS</p><h2 id="demo-title">\u684C\u9762\u4E0A\u7684\u5C0F\u65E5\u5E38</h2></div><button class="pause-demos" id="pause-demos" ${demoClips.some((d) => d.src) ? "" : "disabled"}>${demoClips.some((d) => d.src) ? "\u6682\u505C\u5168\u90E8\u6F14\u793A" : "\u6682\u65E0\u53EF\u64AD\u653E\u5F55\u5C4F"}</button></div><div class="demo-grid">${demoClips.map(DemoCard).join("")}</div></section><section class="paper-section" aria-labelledby="features-title">${spray("panel-flower")}<div class="section-heading"><div><p class="eyebrow">02 / MORE THAN COMPANY</p><h2 id="features-title">\u4E00\u70B9\u70B9\uFF0C\u8BA4\u8BC6\u5343\u65E9</h2></div></div><ul class="feature-list">${[["chat", "\u5927\u6A21\u578B\u5BF9\u8BDD \xB7 \u66F4\u61C2\u5343\u65E9\u7684\u8868\u8FBE", "\u4E13\u95E8\u4E3A\u5983\u5BAB\u5343\u65E9\u6784\u5EFA\u89D2\u8272\u63D0\u793A\u8BCD\uFF0C\u7EC6\u81F4\u8FD8\u539F\u5979\u6E29\u67D4\u4F18\u96C5\u7684\u6027\u683C\u3001\u8BF4\u8BDD\u65B9\u5F0F\u4E0E\u601D\u8003\u4E60\u60EF\uFF0C\u8BA9\u6BCF\u4E00\u6B21\u4EA4\u8C08\u90FD\u66F4\u8D34\u8FD1\u4F60\u719F\u6089\u7684\u5343\u65E9\u3002"], ["dress", "服装切换 · 遇见不同模样", "从菜单中挑选喜欢的服装，在校服与礼服之间切换，也能选择全景或近景，让桌面上的千早以你喜欢的模样相伴。"], ["face", "丰富表情 · 眉眼间的小心情", "为千早选择喜欢的神情，欣赏不同服装下细微的眉眼变化。从一抹浅笑到片刻凝思，让相伴多一些值得留意的细节。"], ["leaf", "主动闲话 · 日常中的轻声问候", "开启主动闲话后，千早会在安静的间隙主动说上几句。你可以调整问候间隔，也可以随时关闭，按自己的节奏享受陪伴。"], ["music", "背景音乐 · 让旋律陪你久一点", "播放随包音乐，或导入自己喜欢的曲目，自由调整音量、切换歌曲与循环方式，让熟悉的旋律陪伴工作和休息。"]].map(([icon, title, body]) => `<li><span class="feature-icon">${featureIcon(icon)}</span><div><h3>${title}</h3><p>${body}</p></div></li>`).join("")}</ul></section><section class="paper-section install-section" aria-labelledby="install-title">${spray("panel-flower")}<div class="section-heading"><div><p class="eyebrow">03 / OUR FIRST MEETING</p><h2 id="install-title">\u4ECE\u521D\u6B21\u89C1\u9762\u5F00\u59CB</h2></div></div><p class="install-lead">\u9009\u62E9\u4F60\u7684\u7CFB\u7EDF\uFF0C\u5C55\u5F00\u5B89\u88C5\u4E0E\u521D\u6B21\u4F7F\u7528\u8BF4\u660E\u3002</p><details><summary><span>macOS<small>macOS 26+ \xB7 Apple Silicon</small></span><span class="disclosure" aria-hidden="true">\uFF0B</span></summary><div class="install-body"><h3>\u7CFB\u7EDF\u8981\u6C42</h3><p>macOS 26 \u6216\u66F4\u65B0\u7248\u672C\uFF0CApple Silicon \u82AF\u7247\u3002</p><h3>\u5B89\u88C5</h3><ol><li>\u4ECE\u9879\u76EE\u7684 Releases \u9875\u9762\u83B7\u53D6 macOS arm64 DMG\u3002</li><li>\u6253\u5F00 DMG\uFF0C\u5C06 ChihayaPet.app \u62D6\u5165\u201C\u5E94\u7528\u7A0B\u5E8F\u201D\uFF0C\u7136\u540E\u542F\u52A8\u3002</li></ol><p class="install-note">\u5F53\u524D\u7248\u672C\u91C7\u7528 ad-hoc \u7B7E\u540D\uFF0C\u5C1A\u672A\u8FDB\u884C Developer ID \u516C\u8BC1\uFF1B\u9996\u6B21\u6253\u5F00\u8BF7\u53C2\u7167\u53D1\u5E03\u8BF4\u660E\u3002</p>${firstSetup()}</div></details><details><summary><span>Windows<small>Windows 11 \xB7 x64</small></span><span class="disclosure" aria-hidden="true">\uFF0B</span></summary><div class="install-body"><h3>\u7CFB\u7EDF\u8981\u6C42</h3><p>Windows 11\uFF0Cx64 \u67B6\u6784\u3002</p><h3>\u5B89\u88C5</h3><ol><li>\u4ECE\u9879\u76EE\u7684 Releases \u9875\u9762\u83B7\u53D6 Windows \u53D1\u884C\u5305\u3002</li><li>\u5F53\u524D ZIP \u7248\u672C\u9700\u5B8C\u6574\u89E3\u538B\u5230\u53EF\u5199\u76EE\u5F55\uFF0C\u518D\u542F\u52A8 ChihayaPet.exe\uFF1B\u4FDD\u7559\u5168\u90E8\u968F\u9644\u6587\u4EF6\uFF0C\u65E0\u9700\u5B89\u88C5 Node.js\u3002</li></ol><p class="install-note">\u5B89\u88C5\u65B9\u5F0F\u4EE5\u6240\u9009\u7248\u672C\u7684\u53D1\u5E03\u8BF4\u660E\u4E3A\u51C6\u3002</p>${firstSetup()}</div></details></section><p class="home-ending">\u2767<br>\u4E0E\u4F60\u76F8\u4F34\u7684\uFF0C\u6BCF\u4E00\u4E2A\u5E73\u5E38\u65E5\u5B50\u3002</p></div></section>`;
}
function firstSetup() {
  return `<h3>\u521D\u6B21\u914D\u7F6E\u4E0E\u4F7F\u7528</h3><ol><li>\u4ECE\u83DC\u5355\u680F\uFF0F\u6258\u76D8\u6253\u5F00\u8BBE\u7F6E\uFF0C\u586B\u5199\u6A21\u578B\u670D\u52A1\u7684 HTTPS \u57FA\u7840\u5730\u5740\u3001\u6A21\u578B\u540D\u79F0\u548C API Key\u3002</li><li>\u53EF\u5148\u6D4B\u8BD5\u8FDE\u63A5\uFF0C\u518D\u4FDD\u5B58\u914D\u7F6E\uFF1B\u6D4B\u8BD5\u4F1A\u5411\u670D\u52A1\u53D1\u51FA\u8BF7\u6C42\uFF0C\u53EF\u80FD\u4EA7\u751F\u8D39\u7528\u3002</li><li>\u70B9\u51FB\u5343\u65E9\u6253\u5F00\u804A\u5929\uFF1B\u62D6\u62FD\u79FB\u52A8\u4EBA\u7269\u3002\u670D\u88C5\u3001\u8868\u60C5\u3001\u95F2\u8BDD\u4E0E\u97F3\u4E50\u53EF\u4ECE\u83DC\u5355\u4E2D\u8C03\u6574\u3002</li></ol>`;
}
function bloomLetter(i) {
  return `<div class="bloom-thread"><svg class="connecting-vine" viewBox="0 0 700 430" preserveAspectRatio="none" aria-hidden="true"><path d="M25 35C580-75 730 142 450 226S36 335 440 427" fill="none" stroke="#89968e" stroke-opacity=".4" stroke-width="1.2"/><path d="M479 209Q514 158 555 174Q543 216 479 209" fill="#c4d1bc88"/><path d="M239 315Q190 265 176 290Q183 320 239 315" fill="#c4d1bc88"/></svg><article class="leaf-question"><span class="speaker">YOU \xB7 \u63D0\u95EE\u793A\u610F</span><p>${["\u4ECA\u5929\u5FD9\u4E86\u4E00\u6574\u5929\uFF0C\u56DE\u5934\u770B\u5374\u597D\u50CF\u4EC0\u4E48\u90FD\u6CA1\u505A\u597D\u3002", "\u4ECA\u5929\u53EA\u6709\u6211\u4E00\u4E2A\u4EBA\u5403\u665A\u996D\uFF0C\u968F\u4FBF\u5E94\u4ED8\u4E00\u4E0B\u5C31\u597D\u4E86\u5427\u3002"][i]}</p></article><article class="petal-answer"><div class="petal-layer"></div><span class="speaker">CHIHAYA \xB7 \u5343\u65E9</span><p class="reply-placeholder">\u8FD9\u91CC\u5C06\u653E\u5165\u5343\u65E9\u7684\u771F\u5B9E\u56DE\u590D\u3002</p><div class="faint-lines"></div><small>\u5B9E\u6D4B\u5BF9\u8BDD\u5C1A\u672A\u63D0\u4F9B \xB7 \u5F53\u524D\u4EC5\u5C55\u793A\u6392\u7248</small><div class="botanical tiny-flower" aria-hidden="true"><svg viewBox="-65 -65 130 130">${blossom(0, 0, 42, "#ebd8e4")}</svg></div></article></div>`;
}
function GardenConversation() {
  return `<section class="garden-page">${spray("corner-spray")}${spray("opposite-spray")}${head("Whispers among petals", "\u82B1\u95F4\u7D6E\u8BED", "\u4E00\u4E9B\u5E73\u5E38\u7684\u5FC3\u4E8B\uFF0C\u5728\u8FD9\u91CC\u88AB\u8F7B\u8F7B\u63A5\u4F4F\u3002")}${bloomLetter(0)}<div class="letter-divider">\u53E6\u4E00\u6BB5\u65E5\u5E38</div>${bloomLetter(1)}</section>`;
}
function mirrorCrest() {
  return `<svg class="mirror-crest" viewBox="0 0 280 100" fill="none" aria-hidden="true"><g stroke="#a06f91" stroke-width="1.3"><path d="M140 91C96 65 123 28 140 10C157 28 184 65 140 91Z" fill="#eee1e9"/><path d="M140 77C113 53 136 35 140 25C153 47 162 55 140 77Z" fill="#f7f7f0"/><path d="M126 74C99 22 44 37 53 66C60 83 85 74 79 59C74 47 62 59 68 64M154 74C181 22 236 37 227 66C220 83 195 74 201 59C206 47 218 59 212 64M124 85C82 62 53 91 25 81C3 72 18 49 29 63M156 85C198 62 227 91 255 81C277 72 262 49 251 63"/><path d="M113 58Q94 5 75 21Q72 42 113 58M167 58Q186 5 205 21Q208 42 167 58" fill="#e6d7e0"/><path d="M105 77C67 90 38 69 32 46M175 77C213 90 242 69 248 46"/></g><circle cx="140" cy="53" r="7" fill="#d4b9cc" stroke="#a06f91"/><circle cx="140" cy="8" r="4" fill="#f9f6eb" stroke="#a06f91"/></svg>`;
}
function GardenWardrobe() {
  return `<section class="garden-page vanity-page">${spray("corner-spray")}${spray("opposite-spray")}${head("Devant le miroir", "\u955C\u524D\u65F6\u5149", "\u4E00\u8EAB\u8863\u88F3\uFF0C\u4E00\u79CD\u5FC3\u60C5\u3002")}<div class="vanity-layout"><aside class="vanity-side"><p class="eyebrow">THE COLLECTION</p><h3>\u4ECA\u65E5\u7684\u8863\u88F3</h3><div class="costume-labels">${costumes.map((c, i) => `<button class="costume-label" data-costume="${i}" aria-pressed="${costume === i}">${c}</button>`).join("")}</div></aside><div class="mirror-scene">${mirrorCrest()}<div class="mirror-shell"><div class="mirror-glass"><img class="character-image" src="assets/${outfitIds[costume]}-${faceIds[expression]}.png" alt="${costumes[costume]} \xB7 ${expressions[expression]}" width="268" height="606"><p class="image-error" hidden>\u56FE\u7247\u6682\u65F6\u65E0\u6CD5\u52A0\u8F7D\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u670D\u88C5\u6216\u7A0D\u540E\u91CD\u8BD5\u3002</p></div></div><div class="mirror-foot"></div></div><aside class="vanity-side"><p class="eyebrow">A LITTLE EXPRESSION</p><h3>\u7709\u773C\u4E4B\u95F4</h3><div class="vanity-expressions">${expressions.map((e, i) => `<button class="pearl-option" data-expression="${i}" aria-pressed="${expression === i}">${e}</button>`).join("")}</div><p class="sub">\u8FD8\u6709\u66F4\u591A\u7EC6\u5FAE\u7684\u795E\u60C5\uFF0C<br>\u7559\u5F85\u4E0E\u4F60\u76F8\u4F34\u65F6\u53D1\u73B0\u3002</p></aside></div><p class="prototype-note">\u4E09\u5957\u8863\u88F3 \xB7 \u4E94\u79CD\u795E\u60C5\u3002\u9009\u56FE\u5F85\u6700\u7EC8\u786E\u8BA4\u3002</p></section>`;
}
function updateWardrobe() {
  const image = document.querySelector(".character-image");
  image.hidden = false;
  document.querySelector(".image-error").hidden = true;
  image.src = `assets/${outfitIds[costume]}-${faceIds[expression]}.png`;
  image.alt = `${costumes[costume]} \xB7 ${expressions[expression]}`;
  document.querySelectorAll("[data-costume]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.costume) === costume)));
  document.querySelectorAll("[data-expression]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.expression) === expression)));
  document.getElementById("selection-status").textContent = image.alt;
}
function render(focus = false) {
  cleanupPlayback();
  const page = currentPage();
  document.title = `${pages[page]} \xB7 \u5983\u5BAB\u5343\u65E9\u684C\u5BA0`;
  document.getElementById("nav").innerHTML = Object.entries(pages).map(([key, title]) => `<a class="page-link" href="?page=${key}" ${key === page ? 'aria-current="page"' : ""}>${key === "conversation" ? "\u5BF9\u8BDD" : key === "wardrobe" ? "\u8863\u6A71" : title}</a>`).join("");
  document.getElementById("app").innerHTML = { home: GardenHome, conversation: GardenConversation, wardrobe: GardenWardrobe }[page]();
  cleanupPlayback = setupDemoPlayback(document);
  const image = document.querySelector(".character-image");
  if (image) {
    image.addEventListener("error", () => {
      image.hidden = true;
      document.querySelector(".image-error").hidden = false;
    });
    image.insertAdjacentHTML("afterend", '<span id="selection-status" class="sr-only" role="status"></span>');
  }
  if (focus) {
    const heading = document.querySelector("h1");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a.page-link, a.brand");
  if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
    event.preventDefault();
    history.pushState({}, "", link.href);
    render(true);
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.costume !== void 0) {
    costume = Number(button.dataset.costume);
    updateWardrobe();
  }
  if (button.dataset.expression !== void 0) {
    expression = Number(button.dataset.expression);
    updateWardrobe();
  }
});
window.addEventListener("popstate", () => render(true));
render();
