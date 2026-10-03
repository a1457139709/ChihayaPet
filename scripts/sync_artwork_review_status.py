#!/usr/bin/env python3
"""Attach the hash-bound #31 delivery receipt to the current art gallery.

This updates metadata only. It preserves the previous selection as history and
does not produce PNGs, register new approvals, or rebuild older costume packs.
"""
import ast
import csv
from datetime import datetime, timedelta, timezone
import json
import re
from pathlib import Path

from standing_character_build import ROOT, GALLERY, RESOURCE, gallery_catalog, sha, validate_standing


def read(path):
    return json.loads(path.read_text())


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sync_approvals():
    """Reconcile the 23 existing approvals with producer records of the same PNGs."""
    ledger = read(ROOT / 'docs/reports/2026-10-03-issue-31-human-review.json')
    approved = {(row['variant'], row['faceID']): row for row in ledger['images']}
    pairs = [
        ('blue-white-rose/close', 'ArtSources/CharacterExpansion/rose-game-style/close/v1',
         'blue-white-rose/close/v1', 'expressions-review.json', 'expressions-manifest.json'),
        ('loose-long-shirt-experiment-v4/close', 'ArtSources/CharacterExpansion/long-shirt-pose-expressions/v4/close/v7',
         'loose-long-shirt-experiment-v4/close/expressions-v7', 'review.json', 'manifest.json'),
    ]
    touched = set()
    def backup(path):
        target = ROOT / 'ArtSources/CharacterExpansion/original-standing/history/approval-records' / path.relative_to(ROOT)
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    for variant, producer, mirrored, review_name, manifest_name in pairs:
        directory = ROOT / producer
        for name in [review_name, manifest_name]:
            path = directory / name
            data = read(path)
            backup(path)
            entries = data['images'].items() if name == review_name else ((r['id'], r) for r in data['results'])
            for face_id, row in entries:
                approval = approved.get((variant, face_id))
                if not approval:
                    continue
                assert sha(directory / row['path']) == row['sha256'] == approval['sha256'], path
                row.update(reviewedSHA256=approval['sha256'], approvalMessage=approval['message'],
                           approvalRecordedAt=approval['recordedAt'], approvalEvidence='docs/reports/2026-10-03-issue-31-human-review.json')
                if name == review_name:
                    row.update(status='approved', message=approval['message'], recordedAt=approval['recordedAt'], source=ledger['source'])
                else:
                    row['humanReview'] = 'approved'
            data.update(approvedCount=12, pendingCount=0)
            if name == manifest_name:
                data['humanReview'] = 'approved'
            save(path, data)
            touched.add(path.relative_to(ROOT).as_posix())
            mirror = ROOT / 'ArtSources/CharacterExpansion/original-standing/showcase' / mirrored / name
            backup(mirror)
            mirror.write_bytes(path.read_bytes())
    path = ROOT / 'ArtSources/CharacterExpansion/long-shirt-pose-experiment/v4/close/v13/approval.json'
    data = read(path)
    backup(path)
    row = data['default00Binding']
    approval = approved['loose-long-shirt-experiment-v4/close', '00']
    assert row['sha256'] == sha(path.parent / row['path']) == approval['sha256']
    if row['status'] != 'approved':
        data['historicalDefault00Binding'] = dict(row)
    row.update(status='approved', message=approval['message'], recordedAt=approval['recordedAt'],
               reviewedSHA256=approval['sha256'], approvalEvidence='docs/reports/2026-10-03-issue-31-human-review.json')
    save(path, data)
    touched.add(path.relative_to(ROOT).as_posix())
    mirror = ROOT / 'ArtSources/CharacterExpansion/original-standing/showcase/loose-long-shirt-experiment-v4/close/v13/approval.json'
    backup(mirror)
    mirror.write_bytes(path.read_bytes())
    return touched


def main():
    validate_standing(ROOT, require_approved=True)
    touched = sync_approvals()
    variants, outfits, page = gallery_catalog()
    runtime = read(ROOT / RESOURCE / 'manifest.json')
    handoff = read(ROOT / 'docs/reports/issue-31-resource-handoff.json')
    images = {key + '/' + image['id']: image['sha256'] for key, variant in runtime['variants'].items() for image in variant['results']}
    assert images == {key + '/' + image['id']: image['sha256'] for key, variant in variants.items()
                      for image in variant['results'] if re.fullmatch(r'\d{2}', image['id'])}
    for key, variant in variants.items():
        archived = handoff['variants'][key]['source']
        assert all(variant.get(field) == archived.get(field) for field in ['canvas', 'bodyLayer', 'bodySHA256', 'faceOffset', 'faceSize', 'faceBinding', 'faceTransform']), key
    directory = ROOT / GALLERY
    original_path = directory / 'manifest.json'
    original = read(original_path)
    showcase_path = directory.parent / 'showcase/manifest.json'
    showcase = read(showcase_path)
    for key, record in showcase['files'].items():
        if record['source'] in touched:
            target = showcase_path.parent / key
            assert target.is_file() and sha(target) == sha(ROOT / record['source']), target
            record['sha256'] = sha(target)
    for record in showcase['sources']:
        for field, name in [('approvalSHA256', 'approval.json'), ('reviewSHA256', 'review.json')]:
            source = record['path'] + '/' + name
            if field in record and source in touched:
                record[field] = sha(ROOT / source)
    selection_path = directory.parent / 'review-selection.json'
    selection = read(selection_path)
    history_path = directory.parent / 'history/review-selection-2026-10-02.json'
    if not history_path.exists():
        history_path.parent.mkdir(parents=True, exist_ok=True)
        assert selection['recordedAt'].startswith('2026-10-02'), 'Refuse to mislabel an unknown selection snapshot'
        history_path.write_bytes(selection_path.read_bytes())
    receipt = {'issue': 31, 'status': 'accepted', 'recordedAt': '2026-10-03T14:06:15+08:00',
               'integrationCommit': '20ba84add07db9efd4492e1eab3bd96706ae2833',
               'reportURL': 'https://github.com/a1457139709/ChihayaPet/blob/20ba84add07db9efd4492e1eab3bd96706ae2833/docs/reports/2026-10-03-issue-31-integration.md',
               'resourceDirectory': RESOURCE.as_posix(), 'runtimeManifestSHA256': sha(ROOT / RESOURCE / 'manifest.json'),
               'scope': '292 hash-matched numbered composites only. Mothers and standalone action references remain art archives.',
               'images': images}
    save(directory.parent / 'application-delivery.json', receipt)
    original['applicationDelivery'] = receipt
    if original['applicationAdaptation']['status'] == 'not-integrated':
        original['applicationAdaptation']['productionTimeStatus'] = 'not-integrated'
    original['applicationAdaptation'].update(status='accepted-by-issue-31', evidence='applicationDelivery')
    original['projectResourceDelivery'].setdefault('productionTimeStatus', original['projectResourceDelivery']['status'])
    original['projectResourceDelivery'].update(status='archived', runtimeDirectory=RESOURCE.as_posix(), applicationIssue=31)
    save(original_path, original)
    progress_path = directory / 'progress.json'
    progress = read(progress_path)
    progress.setdefault('productionTimeApplicationAcceptance', progress['applicationAcceptance'])
    progress['applicationAcceptance'] = 'accepted-by-issue-31'
    progress['applicationDelivery'] = receipt
    progress['projectResourceDelivery'] = original['projectResourceDelivery']
    save(progress_path, progress)
    with (directory / 'inventory.csv').open(newline='') as stream:
        reader = csv.DictReader(stream)
        fields, rows = reader.fieldnames, list(reader)
    for row in rows:
        row['applicationAcceptance'] = 'accepted-by-issue-31'
    with (directory / 'inventory.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    showcase['applicationDelivery'] = receipt
    save(showcase_path, showcase)
    template = (ROOT / 'ArtSources/CharacterExpansion/progress/original-standing.template.html').read_text()
    page.write_text(template.replace('__MANIFEST__', json.dumps(original, ensure_ascii=False))
                   .replace('__SHOWCASE__', json.dumps(showcase, ensure_ascii=False)))
    visible = ast.literal_eval(re.search(r'const visibleOutfits=new Set\((\[.*?\])\)', template)[1])
    save(selection_path, {'mode': 'originals-and-selected-costumes', 'recordedAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
                          'authority': 'v2/review.html visibleOutfits and embedded catalogs',
                          'originalManifest': 'v2/manifest.json', 'originalManifestSHA256': sha(original_path),
                          'showcaseManifest': 'showcase/manifest.json', 'showcaseManifestSHA256': sha(showcase_path),
                          'gallery': 'v2/review.html', 'gallerySHA256': sha(page), 'visibleOutfits': visible,
                          'outfitCount': len(outfits), 'visibleVariants': list(variants), 'visibleImages': 306,
                          'numberedExpressions': 292, 'approvedNumberedExpressions': 292, 'pendingNumberedExpressions': 0,
                          'motherImages': 12, 'independentActionImages': 2,
                          'hiddenCostumeVariants': ['loose-long-shirt/full', 'loose-long-shirt/close'],
                          'history': {'path': 'history/review-selection-2026-10-02.json', 'sha256': sha(history_path)},
                          'applicationDelivery': 'application-delivery.json', 'historicalImagesDeleted': False,
                          'historicalApprovalsDeleted': False, 'newImageApprovals': 0})
    print('Synced current selection and #31 receipt; PNGs and approvals unchanged.')


if __name__ == '__main__':
    main()
