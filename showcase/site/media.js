// Native video controls provide per-clip pause; this button controls the group.
export function setupDemoPlayback(root, preference = window.matchMedia('(prefers-reduced-motion: reduce)')) {
  const videos = [...root.querySelectorAll('.demo-media video')];
  const button = root.getElementById('pause-demos');
  if (!button || !videos.length) return () => {};
  const update = () => {
    button.textContent = videos.some(video => !video.paused) ? '暂停全部演示' : '播放全部演示';
  };
  const play = video => video.play().catch(update);
  const pauseAll = () => videos.forEach(video => video.pause());
  const toggle = () => videos.some(video => !video.paused) ? pauseAll() : videos.forEach(play);
  const preferenceChanged = () => { if (preference.matches) pauseAll(); };
  button.disabled = false;
  button.addEventListener('click', toggle);
  preference.addEventListener('change', preferenceChanged);
  videos.forEach(video => {
    video.muted = true;
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    if (!preference.matches) play(video);
  });
  update();
  return () => {
    pauseAll();
    button.removeEventListener('click', toggle);
    preference.removeEventListener('change', preferenceChanged);
    videos.forEach(video => {
      video.removeEventListener('play', update);
      video.removeEventListener('pause', update);
    });
  };
}
