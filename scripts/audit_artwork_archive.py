#!/usr/bin/env python3
"""Index the actual #60 art workspace; never generate images or grant approval.

Build after saving work/issue-60/before/workspace.json and issues-before.json.
Verify is read-only and also works after the audit files have been committed.
The archived CSVs explicitly distinguish local files from Git-delivered files.
"""
import argparse
import csv
from datetime import datetime, timedelta, timezone
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
import subprocess

from standing_character_build import ROOT, GALLERY, RESOURCE, gallery_catalog, gallery_source, png_size, validate_standing

OUT = ROOT / 'docs/reports/issue-60'
WORK = ROOT / 'work/issue-60'
ORIGINALS = {'a', 'a_', 'b', 'b_', 'c', 'd', 'e'}
METADATA = ('production.json', 'manifest.json', 'binding.json', 'approval.json',
            'review.json', 'human-review.json', 'current-review.json',
            'expressions-review.json', 'expression-approval.json', 'scope-update.json',
            'scope-confirmation.json', 'verification.json', 'technical-verification.json',
            'qa-verification.json', 'visual-inspection.json', 'qa-visual-inspection.json',
            'visual-verification.json', 'expressions-manifest.json')


def read(path):
    return json.loads(path.read_text())


def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path):
    return path.resolve().relative_to(ROOT).as_posix()


def file_record(path, expected=None):
    assert path.is_file(), f'Missing file: {path}'
    digest = sha(path)
    assert expected is None or digest == expected, f'Hash mismatch: {path}'
    return {'path': relative(path), 'sha256': digest, 'bytes': path.stat().st_size}


def write_csv(name, fields, rows):
    with (OUT / name).open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: row.get(key, '') for key in fields} for row in rows)


def topic(path):
    if 'native-tea/' in path or 'native-tea-' in path or 'issue-10' in path:
        return 'cancelled-tea'
    if any(s in path for s in ['rose-princess', 'blue-white-rose-princess', 'issue-50', 'issue-58', 'issue-59']):
        return 'rose-hands'
    if any(s in path for s in ['maid-service', 'red-white-anime-maid-work', 'issue-51', 'issue-56', 'issue-57']):
        return 'maid-service'
    if any(s in path for s in ['exam-inner', 'experiment-v4', 'experiment/v4', 'expressions/v4', 'issue-49', 'issue-54', 'issue-55', 'issues-49-54-55']):
        return 'exam-inner'
    if any(s in path for s in ['exam-v1', 'experiment-v1', 'experiment/v1', 'expressions/v1', 'issue-47', 'issue-48', 'issue-52', 'issue-53']):
        return 'exam'
    if any(s in path for s in ['rose-game-style', 'blue-white-rose', 'candidate-crops/rose', 'issue-30', 'issue-36', 'issue-37', 'issue-38']):
        return 'rose'
    if any(s in path for s in ['red-skirt-game-style', 'red-white-anime-maid', 'issue-39', 'issue-40', 'issue-41', 'issue-42']):
        return 'maid'
    if any(s in path for s in ['long-shirt-game-style', 'loose-long-shirt', 'issue-43', 'issue-44', 'issue-45', 'issue-46']):
        return 'hidden-shirt'
    if 'OriginalStandingSprites/' in path:
        return 'original-project-archive'
    if 'StandingCharacterSprites/' in path or 'issue-31' in path:
        return 'application-31'
    if 'original-standing/' in path:
        return 'original-gallery'
    if path.startswith(('scripts/', '.agents/', 'CONTEXT.md')):
        return 'tooling-domain'
    if path.startswith('docs/'):
        return 'plans-reports'
    return 'other-art-evidence'


def role(path):
    name = Path(path).name
    if Path(path).suffix in {'.py', '.cjs', '.swift', '.sh'}:
        return 'reproduction-script'
    if 'prompt' in name:
        return 'generation-prompt'
    if any(s in name for s in ['approval', 'review.json', 'review-selection']):
        return 'human-review-evidence'
    if Path(path).suffix == '.json':
        return 'production-or-verification-record'
    if 'qa' in path or 'browser' in name or 'board' in name:
        return 'inspection-evidence'
    if any(s in path for s in ['layers/', 'mask', 'mother-body']):
        return 'layer-or-mask'
    if Path(path).suffix == '.png':
        return 'image'
    if Path(path).suffix in {'.html', '.md', '.csv'}:
        return 'review-page-or-document'
    return 'intermediate-or-reference'


def current_inventory():
    variants, names, page = gallery_catalog()
    handoff = read(ROOT / 'docs/reports/issue-31-resource-handoff.json')
    runtime = read(ROOT / RESOURCE / 'manifest.json')
    ledger = read(ROOT / 'docs/reports/2026-10-03-issue-31-human-review.json')
    ledger_by_key = {(r['variant'], r['faceID']): r for r in ledger['images']}
    assert set(variants) == set(handoff['variants']) == set(runtime['variants'])
    groups, images, dependencies = {}, [], set()
    for key, variant in variants.items():
        delivered = handoff['variants'][key]
        method = delivered['bindingMethod']
        body = file_record(gallery_source(variant['bodyLayer']), delivered['bodyLayerSHA256'])
        body_source = file_record(ROOT / variant['bodySource'], variant['bodySHA256'])
        production_dir = ROOT / GALLERY if variant['outfit'] in ORIGINALS else (ROOT / variant['bodySource']).parent
        # v13 mother and v7 expressions are separate production versions.
        if key == 'loose-long-shirt-experiment-v4/close':
            expression_dir = ROOT / 'ArtSources/CharacterExpansion/long-shirt-pose-expressions/v4/close/v7'
        else:
            expression_dir = production_dir if variant['outfit'] not in ORIGINALS else ROOT / GALLERY / 'variants' / key
        records = {r['id']: r for r in delivered['images']}
        resources = {r['id']: r for r in runtime['variants'][key]['results']}
        ids = [f'{i:02}' for i in range(7 if variant['outfit'] in {'b', 'b_'} else 12)]
        assert [r['id'] for r in variant['results'] if r['id'].isdigit()] == ids, key
        evidence = []
        for directory in sorted({production_dir, expression_dir}):
            for name in METADATA:
                path = directory / name
                if path.is_file():
                    evidence.append(file_record(path))
            for path in sorted(directory.glob('*')):
                if path.is_file() and path.suffix in {'.py', '.cjs'}:
                    evidence.append(file_record(path))
        for link in variant.get('links', []):
            path = gallery_source(link['path'])
            if path.suffix == '.json' and path.is_file():
                record = file_record(path)
                if record not in evidence:
                    evidence.append(record)
        evidence.sort(key=lambda record: record['path'])
        group_images = []
        for result in variant['results']:
            kind = result.get('kind', 'expression')
            numbered = result['id'].isdigit()
            output = file_record(gallery_source(result['path']), result['sha256'])
            assert png_size(ROOT / output['path']) == tuple(variant['canvas']), output['path']
            assert result['humanReview'] == 'approved' and result.get('reviewedSHA256') == output['sha256'], output['path']
            assert result.get('approvalMessage') and result.get('approvalRecordedAt'), output['path']
            layers = {field: file_record(gallery_source(value), result.get(field + 'SHA256'))
                      for field, value in result.items() if field.endswith('Layer') and isinstance(value, str)}
            if 'source' in result:
                original = file_record(ROOT / result['source'], result.get('sourceSHA256'))
            else:
                original = None
            producer = expression_dir / ('face-' + result['id'] + '.png') if numbered else production_dir / 'mother-body.png'
            if kind == 'action-candidate':
                producer = ROOT / 'ArtSources/CharacterExpansion/rose-princess-actions/v2' / variant['view'] / 'candidate.png'
            if producer.is_file():
                production_png = file_record(producer, output['sha256'])
            else:
                production_png = output
            approval = {'status': 'approved', 'sha256': output['sha256'],
                        'message': result['approvalMessage'], 'recordedAt': result['approvalRecordedAt'],
                        'source': result.get('reviewSource') or result.get('approvalEvidence') or result.get('approvalSource') or 'Current registered gallery record'}
            runtime_png = None
            if numbered:
                assert records[result['id']]['sha256'] == resources[result['id']]['sha256'] == output['sha256'], key
                runtime_png = file_record(ROOT / RESOURCE / resources[result['id']]['path'], output['sha256'])
                assert resources[result['id']]['review']['status'] == 'approved'
                if (key, result['id']) in ledger_by_key:
                    recorded = ledger_by_key[key, result['id']]
                    assert recorded['sha256'] == output['sha256']
                    approval.update(source=ledger['source'], evidence='docs/reports/2026-10-03-issue-31-human-review.json')
            row = {'key': key + '/' + result['id'], 'variant': key, 'name': names[variant['outfit']],
                   'view': variant['view'], 'id': result['id'], 'kind': kind,
                   'canvas': variant['canvas'], 'bindingMethod': method if numbered else 'not-an-expression',
                   'productionVersion': relative(expression_dir if numbered else producer.parent),
                   'galleryVersion': relative(gallery_source(result['path']).parent),
                   'productionPNG': production_png, 'galleryPNG': output, 'runtimePNG': runtime_png,
                   'source': original, 'layers': layers, 'bodyLayer': body, 'approval': approval,
                   'pixelCheck': result.get('pixelCheck', 'see-version-verification'),
                   'issue': result.get('issue') or variant.get('issue') or 'https://github.com/a1457139709/ChihayaPet/issues/29',
                   'applicationAcceptance': 'passed-by-issue-31' if numbered else 'art-reference-only'}
            images.append(row)
            group_images.append(row['key'])
            for record in [output, production_png, original, body, body_source, *layers.values(), *evidence]:
                if record:
                    dependencies.add(record['path'])
        groups[key] = {'name': names[variant['outfit']], 'canvas': variant['canvas'], 'expressionIDs': ids,
                       'productionVersion': relative(production_dir), 'expressionVersion': relative(expression_dir),
                       'bindingMethod': method, 'faceOffset': variant.get('faceOffset'), 'faceSize': variant.get('faceSize'),
                       'originalFaceSize': variant.get('originalFaceSize', variant.get('faceSize')),
                       'binding': delivered['binding'], 'faceTransform': variant.get('faceTransform'),
                       'bodySource': body_source, 'bodyLayer': body, 'evidence': evidence, 'imageKeys': group_images,
                       'stages': {'production': 'exported', 'technicalVerification': 'hash-and-PNG-rechecked; pixel evidence from version records and #31',
                                  'humanReview': 'approved-current-SHA256', 'projectResources': 'archived-by-issue-31',
                                  'engineeringPackaging': 'passed-by-issue-31', 'applicationLoading': 'passed-by-issue-31',
                                  'actualRuntimeAcceptance': 'passed-by-issue-31'}}
    counts = Counter(row['kind'] for row in images)
    assert counts == {'expression': 292, 'mother': 12, 'action-candidate': 2}, counts
    return {'issue': 60, 'snapshotDate': '2026-10-03', 'timezone': 'Asia/Shanghai',
            'authority': 'Actual v2/review.html embedded catalogs filtered by visibleOutfits; approvals reused only for matching hashes',
            'gallery': file_record(page), 'counts': {'groups': len(names), 'views': len(groups), 'expressions': 292,
                                                    'approvedExpressions': 292, 'pendingExpressions': 0, 'mothers': 12, 'actions': 2},
            'groups': groups, 'images': images}, dependencies


def history_index(current, dependencies):
    library = ROOT / 'ArtSources/CharacterExpansion'
    directory_records = defaultdict(list)
    rows = []
    tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0'))
    current_directories = {group[field] + '/' for group in current['groups'].values()
                           for field in ['productionVersion', 'expressionVersion']}
    for path in sorted(p for p in library.rglob('*') if p.is_file()):
        record = file_record(path)
        local = record['path']
        scope = ('current-dependency' if local in dependencies else
                 'current-version-production-material' if '/history/' not in local and any(local.startswith(p) for p in current_directories) else
                 'retained-history-or-reference')
        rows.append(dict(record, topic=topic(local), role=role(local), scope=scope,
                         gitState='index-present' if local in tracked else 'untracked'))
        if path.name in METADATA or path.name in {'review-selection.json', 'progress.json', 'scope-revision.json'}:
            data = read(path)
            summary = {key: data[key] for key in ['issue', 'version', 'status', 'humanReview', 'reviewCounts',
                                                   'scope', 'approvedCount', 'pendingCount', 'applicationAcceptance'] if key in data}
            directory_records[relative(path.parent)].append(dict(record, recordedFields=summary,
                                                                 interpretation='Historical record for its own files; no approval transfer'))
    write_csv('art-files.csv', ['path', 'sha256', 'bytes', 'topic', 'role', 'scope', 'gitState'], rows)
    showcase = read(ROOT / 'ArtSources/CharacterExpansion/original-standing/showcase/manifest.json')
    hidden = []
    for key, variant in showcase['variants'].items():
        if key in current['groups']:
            continue
        results = []
        for image in variant['results']:
            record = file_record(gallery_source(image['path']), image['sha256'])
            results.append(dict(record, id=image['id'], kind=image.get('kind', 'expression'),
                                humanReview=image.get('humanReview'), reviewedSHA256=image.get('reviewedSHA256')))
        hidden.append({'variant': key, 'status': 'hidden-current-gallery', 'countedInCurrent': False, 'images': results})
    assert sum(r['kind'] == 'expression' for group in hidden for r in group['images']) == 24
    issues = read(OUT / 'issues-snapshot.json')
    cancelled = [{'number': issue['number'], 'title': issue['title'], 'state': issue['state'],
                  'comments': [comment for comment in issue['comments'] if '范围取消' in comment['body']]} for issue in issues
                 if issue['number'] in set(range(1, 22)) | {27}]
    assert len(cancelled) == 22 and next(item for item in cancelled if item['number'] == 1)['comments']
    for item in cancelled:
        item['currentScope'] = 'cancelled-as-part-of-tea-work'
        item['cancellationAuthority'] = 'https://github.com/a1457139709/ChihayaPet/issues/1#issuecomment-5913009339'
        item['historicalCompletion'] = 'Preserve the original ticket, files and approvals; cancelling the motion does not invalidate a prior mother-image approval.'
    return {'issue': 60, 'snapshotAt': datetime.now(timezone(timedelta(hours=8))).isoformat(),
            'gitStateScope': 'At index generation, before the scoped #60 commit; use scoped-paths.json for the subsequently delivered metadata.',
            'assetFileCount': len(rows), 'assetBytes': sum(row['bytes'] for row in rows),
            'fileInventory': 'art-files.csv', 'hiddenVariants': hidden, 'cancelledTeaIssues': cancelled,
            'directories': dict(sorted(directory_records.items())),
            'selectionHistory': file_record(ROOT / 'ArtSources/CharacterExpansion/original-standing/history/review-selection-2026-10-02.json'),
            'note': 'Retained history, rejected candidates, approval records and intermediates stay on disk. A CLOSED issue alone is not an image approval.'}


def index_entries():
    data = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=ROOT)
    for line in data.decode().split('\0'):
        if line:
            prefix, path = line.split('\t', 1)
            mode, oid, stage = prefix.split()
            yield path, {'mode': mode, 'oid': oid, 'stage': int(stage)}


def workspace_inventory(dependencies):
    baseline = read(WORK / 'before/workspace.json')
    staged_before = {}
    for line in (WORK / 'before/index.zlist').read_bytes().decode().split('\0'):
        if line:
            prefix, path = line.split('\t', 1)
            mode, oid, stage = prefix.split()
            staged_before[path] = oid
    def proposal(path):
        if path.startswith('work/'):
            return 'retain-local-evidence; archive-authoritative-records-separately'
        if path in dependencies:
            return 'archive-current-production-and-verification-by-topic'
        if 'OriginalStandingSprites/' in path:
            return 'archive-original-base-resources-with-handoff'
        if path.startswith('ArtSources/'):
            return 'archive-history-or-reference-separately; preserve-approvals'
        return 'review-and-commit-documents-or-tooling-by-topic'
    rows = [dict(row, topic=topic(row['path']), role=role(row['path']),
                 indexBlob=staged_before.get(row['path'], '') if row['status'][0] != '?' else '',
                 proposal=proposal(row['path'])) for row in baseline['files']]
    write_csv('workspace-changes.csv', ['path', 'status', 'sha256', 'bytes', 'indexBlob', 'topic', 'role', 'proposal'], rows)
    groups = {}
    for key in sorted({row['topic'] for row in rows}):
        group = [row for row in rows if row['topic'] == key]
        groups[key] = {'files': len(group), 'bytes': sum(row['bytes'] or 0 for row in group),
                       'statuses': dict(Counter(row['status'] for row in group)),
                       'roles': dict(Counter(row['role'] for row in group)),
                       'roots': sorted({('/'.join(row['path'].split('/')[:3]) if row['path'].startswith(('ArtSources/', 'ChihayaPet/'))
                                       else '/'.join(row['path'].split('/')[:2])) for row in group})}
    scope = set(read(OUT / 'scoped-paths.json'))
    save('submission-plan.json', {
        'issue': 60, 'baselineCommit': baseline['head'],
        'auditDeliveryPaths': sorted(scope),
        'preservation': 'No PNG deletion, image change, approval transfer or bulk staging.',
        'batches': [{'topic': key, 'state': 'not-submitted-by-this-audit',
                    'commitCandidates': [row['path'] for row in rows if row['topic'] == key and not row['path'].startswith('work/') and row['path'] not in scope],
                    'retainedLocalEvidence': [row['path'] for row in rows if row['topic'] == key and row['path'].startswith('work/')],
                    'prerequisite': 'Review the matching SHA256, index blob and disposition in workspace-changes.csv; retain history and source references.'}
                   for key in groups]})
    return {key: value for key, value in baseline.items() if key != 'files'} | {
        'expandedDirtyFiles': len(rows), 'bytes': sum(row['bytes'] or 0 for row in rows),
        'stagedFiles': sum(row['status'][0] not in {' ', '?'} for row in rows),
        'untrackedFiles': sum(row['status'] == '??' for row in rows), 'groups': groups,
        'fileInventory': 'workspace-changes.csv',
        'submissionPolicy': 'Only #60 audit and current metadata are scoped for this delivery; existing PNGs, production sources and work evidence remain individually indexed with their real local Git state.'}


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    current, dependencies = current_inventory()
    save('current-inventory.json', current)
    rows = []
    for image in current['images']:
        rows.append({'key': image['key'], 'name': image['name'], 'kind': image['kind'], 'view': image['view'],
                     'productionVersion': image['productionVersion'], 'bindingMethod': image['bindingMethod'],
                     'productionPNG': image['productionPNG']['path'], 'galleryPNG': image['galleryPNG']['path'],
                     'runtimePNG': (image['runtimePNG'] or {}).get('path', ''), 'sha256': image['galleryPNG']['sha256'],
                     'width': image['canvas'][0], 'height': image['canvas'][1],
                     'source': (image['source'] or {}).get('path', ''), 'sourceSHA256': (image['source'] or {}).get('sha256', ''),
                     'approval': image['approval']['status'], 'approvalRecordedAt': image['approval']['recordedAt'],
                     'applicationAcceptance': image['applicationAcceptance']})
    write_csv('current-inventory.csv', list(rows[0]), rows)
    save('history-index.json', history_index(current, dependencies))
    save('workspace-snapshot.json', workspace_inventory(dependencies))
    print(json.dumps(current['counts'], ensure_ascii=False))


def verify():
    current = read(OUT / 'current-inventory.json')
    fresh, _ = current_inventory()
    assert current == fresh, 'Current gallery, files, sources, bindings or approvals changed; rebuild the inventory'
    all_records = {}
    for image in current['images']:
        for record in [image['productionPNG'], image['galleryPNG'], image['runtimePNG'], image['source'], image['bodyLayer'], *image['layers'].values()]:
            if record:
                all_records[record['path']] = record['sha256']
    for group in current['groups'].values():
        for record in [group['bodySource'], *group['evidence']]:
            all_records[record['path']] = record['sha256']
    for path, digest in all_records.items():
        assert sha(ROOT / path) == digest, path
    validate_standing(ROOT, require_approved=True)
    pixel_records = read(ROOT / 'docs/reports/issue-31-pixel-verification.json')['images']
    expected_pixels = {(row['variant'], row['id'], row['galleryPNG']['sha256'])
                       for row in current['images'] if row['kind'] == 'expression'}
    assert {(row['variant'], row['id'], row['sha256']) for row in pixel_records} == expected_pixels
    assert all(row['sourceByteDifferences'] == row['outsideFaceRGBADifferences'] == 0 for row in pixel_records)
    original_archive = ROOT / 'ChihayaPet/Resources/OriginalStandingSprites'
    original_hashes = read(original_archive / 'handoff.json')['assetHashes']
    assert len(original_hashes) == 310
    for path, digest in original_hashes.items():
        assert sha(original_archive / path) == digest, path
    selection = read(ROOT / 'ArtSources/CharacterExpansion/original-standing/review-selection.json')
    assert set(selection['visibleVariants']) == set(current['groups'])
    assert (selection['visibleImages'], selection['numberedExpressions'], selection['motherImages'], selection['independentActionImages']) == (306, 292, 12, 2)
    assert selection['gallerySHA256'] == current['gallery']['sha256']
    history = read(OUT / 'history-index.json')
    records = 0
    with (OUT / 'art-files.csv').open(newline='') as stream:
        for row in csv.DictReader(stream):
            assert sha(ROOT / row['path']) == row['sha256'], 'Archived art changed: ' + row['path']
            records += 1
    assert records == history['assetFileCount']
    # Preserve every pre-existing staging object except the explicit #60 metadata scope.
    scope = set(read(OUT / 'scoped-paths.json'))
    index = dict(index_entries())
    retained = 0
    with (OUT / 'workspace-changes.csv').open(newline='') as stream:
        for row in csv.DictReader(stream):
            if row['path'] in scope:
                continue
            assert sha(ROOT / row['path']) == row['sha256'], 'Pre-existing file changed: ' + row['path']
            if row['indexBlob']:
                assert index[row['path']]['oid'] == row['indexBlob'], 'Pre-existing staging changed: ' + row['path']
            retained += 1
    result = {'status': 'passed', 'currentExpressions': 292, 'mothers': 12, 'actions': 2,
              'currentDependencyFiles': len(all_records), 'retainedArtFiles': records,
              'retainedWorkspaceFilesOutsideScope': retained, 'runtimeSourceAndBundle': 'passed',
              'priorPixelEvidenceCurrentHashMatches': 292, 'originalBaseArchivePNGMatches': 310,
              'imageChanges': 0, 'newHumanApprovals': 0}
    print(json.dumps(result, ensure_ascii=False))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true')
    args = parser.parse_args()
    if args.build:
        build()
    else:
        verify()
