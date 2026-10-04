export async function waitForSprite(page) {
  await page.waitForFunction(async () => {
    const { sprite } = await window.chihaya.snapshot();
    const canvas = document.querySelector('canvas');
    if (!sprite || !canvas || canvas.width !== sprite.canvas[0] || canvas.height !== sprite.canvas[1]) return false;
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
  });
}
