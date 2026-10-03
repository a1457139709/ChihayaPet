#!/usr/bin/env python3
"""Make review boards from opt-in native captures, without changing pet assets."""
from pathlib import Path
import argparse
import hashlib
import json
import math

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent


def build(qa, output):
    manifest_path = ROOT / 'ChihayaPet/Resources/StandingCharacterSprites/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    report = json.loads((qa / 'report.json').read_text())
    assert report['manifestSHA256'] == hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    records = report['captures'] + report['bubbleCaptures']
    assert len(records) == 1000
    for record in records:
        assert hashlib.sha256((qa / record['file']).read_bytes()).hexdigest() == record['sha256']
    output.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 17)
    boards = []
    for key, variant in manifest['variants'].items():
        name = next(o['name'] for o in manifest['outfits'] if o['id'] == variant['outfit'])
        slug = key.replace('/', '--')
        cell_w, cell_h = 300, 460
        faces = Image.new('RGB', (cell_w * 4, cell_h * math.ceil(len(variant['results']) / 4)), '#ebe7e5')
        draw = ImageDraw.Draw(faces)
        sources = []
        scale = 256 / variant['canvas'][1] * 2
        for i, result in enumerate(variant['results']):
            x0, y0 = i % 4 * cell_w, i // 4 * cell_h
            draw.text((x0 + 8, y0 + 4), f"{name} · {variant['framing']} · {result['id']}", font=font, fill='#281e1e')
            for j, background in enumerate(['light', 'dark']):
                filename = f"{slug}--{result['id']}--h256--{background}.png"
                sources.append(filename)
                image = Image.open(qa / filename).convert('RGB')
                whole = image.copy(); whole.thumbnail((146, 255))
                faces.paste(whole, (x0 + j * 150 + (150 - whole.width) // 2, y0 + 28))
                x, y, w, h = variant['faceRect']
                rect = (int(24 + (x - 14) * scale), int(24 + (y - 25) * scale),
                        int(24 + (x + w + 14) * scale), int(24 + (y + h + 12) * scale))
                face = image.crop(rect); face.thumbnail((146, 168))
                faces.paste(face, (x0 + j * 150 + (150 - face.width) // 2, y0 + 288))
        faces_path = output / f'{slug}--expressions.jpg'
        faces.save(faces_path, quality=95, subsampling=0)
        boards.append({'variant': key, 'kind': 'all-expressions-light-dark', 'file': faces_path.name,
                       'sha256': hashlib.sha256(faces_path.read_bytes()).hexdigest(), 'captures': sources})
        sizes = Image.new('RGB', (1400, 1170), '#ebe7e5')
        draw = ImageDraw.Draw(sizes); sources = []
        for row, height in enumerate([240, 256, 480]):
            for column, (edge, background) in enumerate([('left', 'light'), ('left', 'dark'), ('right', 'light'), ('right', 'dark')]):
                x0, y0 = column * 350, row * 390
                draw.text((x0 + 8, y0 + 4), f'{name} · {height}pt · {edge} · {background}', font=font, fill='#281e1e')
                filename = f'{slug}--bubble--h{height}--{edge}--{background}.png'
                sources.append(filename)
                image = Image.open(qa / filename).convert('RGB'); image.thumbnail((338, 350))
                sizes.paste(image, (x0 + (350 - image.width) // 2, y0 + 32 + (350 - image.height) // 2))
        sizes_path = output / f'{slug}--sizes-bubbles.jpg'
        sizes.save(sizes_path, quality=95, subsampling=0)
        boards.append({'variant': key, 'kind': 'three-sizes-both-screen-edges-light-dark', 'file': sizes_path.name,
                       'sha256': hashlib.sha256(sizes_path.read_bytes()).hexdigest(), 'captures': sources})
    (output / 'native-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (output / 'index.json').write_text(json.dumps({'boards': boards, 'captureCount': len(records),
        'nativeCaptureDirectory': str(qa.relative_to(ROOT)), 'nativeCaptureReport': 'native-report.json'}, ensure_ascii=False, indent=2) + '\n')
    cards = ''.join(f"<figure><img loading='lazy' src='{b['file']}'><figcaption>{b['variant']} · {b['kind']}</figcaption></figure>" for b in boards)
    (output / 'review.html').write_text('<meta charset="utf-8"><title>#31 应用验收</title><style>body{font:14px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr)}figure{margin:8px}img{width:100%}</style><h1>13 组／26 取景／292 表情 · 原生 Retina 验收</h1><p>表达式、三个显示高度、左右屏幕边缘及浅深背景。原始截图哈希见 native-report.json。</p><main>' + cards + '</main>')
    print('Verified 1000 native capture hashes and built 52 review boards.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--qa-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    build(args.qa_dir.resolve(), args.output_dir.resolve())
