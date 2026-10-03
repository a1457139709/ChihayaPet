// Run the real gallery startup so archived costumes cannot disappear from its menu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const gallery = path.join(root, 'ArtSources/CharacterExpansion/original-standing');
const template = path.join(root, 'ArtSources/CharacterExpansion/progress/original-standing.template.html');
const read = file => fs.readFileSync(file, 'utf8');
const requiredOutfits = ['blue-white-rose', 'red-white-anime-maid', 'loose-long-shirt-experiment-v1', 'loose-long-shirt-experiment-v4'];
const displayNames = {
  'loose-long-shirt-experiment-v1': '体检服',
  'loose-long-shirt-experiment-v4': '体检服-里',
};

function startGallery(file, search) {
  const html = read(file);
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
  const nodes = new Map();
  for (const [id, manifest] of [['data', 'v2/manifest.json'], ['showcase-data', 'showcase/manifest.json']]) {
    const embedded = scripts.find(([, attrs]) => attrs.includes(`id="${id}"`))[2];
    nodes.set(id, { textContent: embedded.startsWith('__') ? read(path.join(gallery, manifest)) : embedded });
  }
  for (const id of ['outfit', 'view', 'status']) {
    const values = id === 'view' ? ['all', 'full', 'close'] : ['all'];
    nodes.set(id, {
      value: 'all', options: values.map(value => ({ value })),
      append(option) { this.options.push(option); },
    });
  }
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: '', append() {} });
      return nodes.get(id);
    },
    createElement() { return {}; },
  };
  const runtime = scripts.find(([, attrs]) => !attrs.includes('application/json'))[2];
  const startup = runtime.slice(0, runtime.indexOf('function stop()'));
  assert.ok(startup.length > 0, 'Gallery startup must be exercised');
  const linkFunction = runtime.match(/^function link\(.*$/m)[0];
  const state = vm.runInNewContext(startup + '\n' + linkFunction + `\n({
    outfits: $('outfit').options.map(option => option.value),
    outfitLabels: Object.fromEntries($('outfit').options.map(option => [option.value, option.textContent])),
    variants: Object.keys(variants),
    variantLabels: Object.fromEntries(Object.entries(variants).map(([key, variant]) => [key, variant.name])),
    originalCount: originals.length,
    visible: filtered().map(image => ({ variant: image.variantKey, id: image.r.id, sha256: image.r.sha256, status: status(image), label: image.r.outputLabel || image.v.outputLabel })),
  })`, { document, location: { search }, URLSearchParams, localStorage: { getItem() { return null; } } });
  return JSON.parse(JSON.stringify(state));
}

for (const file of [template, path.join(gallery, 'v2/review.html')]) {
  test(`${path.relative(root, file)} retains restored costumes and their paired views`, () => {
    const state = startGallery(file, '');
    assert.equal(state.originalCount, 148);
    for (const outfit of requiredOutfits) {
      assert.ok(state.outfits.includes(outfit), `Missing costume menu entry: ${outfit}`);
      if (displayNames[outfit]) assert.equal(state.outfitLabels[outfit], displayNames[outfit]);
      for (const view of ['full', 'close']) {
        const variant = `${outfit}/${view}`;
        if (displayNames[outfit]) assert.equal(state.variantLabels[variant], displayNames[outfit]);
        const filtered = startGallery(file, `?outfit=${outfit}&view=${view}`).visible;
        const expectedCount = 13;
        assert.equal(filtered.length, expectedCount, `${variant}: registered mother and expressions must be available`);
        assert.ok(filtered.every(image => image.variant === variant));
        if (displayNames[outfit]) assert.ok(filtered.every(image => image.label.startsWith(displayNames[outfit] + ' · ')),
          `${variant}: preview labels must use the requested costume name`);
        const expected = JSON.parse(read(path.join(gallery, 'showcase/manifest.json'))).variants[variant].results;
        assert.deepEqual(filtered.map(image => [image.id, image.sha256, image.status]),
          expected.map(image => [image.id, image.sha256, image.humanReview]));
      }
    }
    assert.ok(!state.variants.some(variant => variant.startsWith('loose-long-shirt/')),
      'Renaming the trial costumes must preserve the separate base shirt scope');
  });

  test(`${path.relative(root, file)} keeps restored costumes available from the v4 shortcut`, () => {
    const state = startGallery(file, '?outfit=loose-long-shirt-experiment-v4&view=full');
    for (const outfit of requiredOutfits) {
      assert.ok(state.outfits.includes(outfit), `Missing costume menu entry from v4: ${outfit}`);
      for (const view of ['full', 'close']) {
        assert.ok(state.variants.includes(`${outfit}/${view}`));
      }
    }
    assert.equal(state.visible.length, 13);
    assert.ok(state.visible.every(image => image.variant === 'loose-long-shirt-experiment-v4/full'));
  });
}
