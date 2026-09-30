"""Read-only inspection and export of recorded landmarks, never model inputs/weights.

The database has no acquisition/mirror flag. Blocks ending in a complete pose
are retained separately in id order; they are NOT certified original/mirror takes.
"""
import argparse
import collections
import hashlib
import json
import sqlite3
from pathlib import Path


def split_blocks(rows):
    blocks, points, keys = [], [], set()
    valid = True
    for row in rows:
        key = (row['type'], row['hand'], row['landmark_id'])
        if key in keys:
            valid = False
        keys.add(key)
        points.append([row['type'], row['hand'], row['landmark_id'], row['x'], row['y'], row['z']])
        if row['type'] == 'pose' and row['landmark_id'] == 22:
            groups = collections.defaultdict(list)
            for kind, hand, index, *_ in points:
                groups[(kind, hand)].append(index)
            valid = valid and groups[('pose', -1)] == list(range(23))
            valid = valid and all(ids == list(range(21)) for (kind, _), ids in groups.items() if kind == 'hand')
            blocks.append(points if valid else None)
            points, keys, valid = [], set(), True
    if points:
        blocks.append(None)  # Explicitly missing/ambiguous; do not join across frames.
    return blocks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('--output', type=Path, default=Path('web/public/dataset-examples'))
    parser.add_argument('--per-class', type=int, default=3)
    args = parser.parse_args()
    if args.per_class < 1:
        parser.error('--per-class must be at least 1')
    db_path = args.database.resolve(strict=True)
    with db_path.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    conn = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA query_only=ON')
    labels = json.loads(Path('web/public/model/metadata.json').read_text(encoding='utf-8'))['labels']
    report = {'sha256': digest, 'bytes': db_path.stat().st_size, 'tables': {}, 'labels': {}, 'httpVideoPaths': 0}
    for table in ('video', 'frame_landmark', 'video_feature'):
        report['tables'][table] = {'columns': [dict(r) for r in conn.execute(f'PRAGMA table_info({table})')],
                                 'rows': conn.execute(f'SELECT count(*) FROM {table}').fetchone()[0]}
    report['labels'] = dict(conn.execute('SELECT label,count(*) FROM video GROUP BY label').fetchall())
    report['httpVideoPaths'] = conn.execute("SELECT count(*) FROM video WHERE path LIKE 'http%' ").fetchone()[0]
    args.output.mkdir(parents=True, exist_ok=True)
    catalog = {'source': 'https://www.kaggle.com/datasets/metehanzdeniz/sign-language-recognition/data',
               'sha256': digest, 'labels': labels, 'records': []}
    for label in labels:
        videos = conn.execute('SELECT * FROM video WHERE label=? ORDER BY id LIMIT ?', (label, args.per_class)).fetchall()
        for video in videos:
            frames = collections.defaultdict(list)
            for row in conn.execute('SELECT * FROM frame_landmark WHERE video_id=? ORDER BY frame_index,id', (video['id'],)):
                frames[row['frame_index']].append(row)
            exported = [{'index': index, 'blocks': split_blocks(rows)} for index, rows in frames.items()]
            item = {'id': video['id'], 'label': label, 'file': Path(video['path']).name,
                    'duration': video['duration'], 'frames': len(frames),
                    'blocks': max((len(f['blocks']) for f in exported), default=0),
                    'invalidBlocks': sum(b is None for f in exported for b in f['blocks']),
                    'handIds': sorted({r['hand'] for rows in frames.values() for r in rows if r['type'] == 'hand'})}
            catalog['records'].append(item)
            (args.output / f"{video['id']}.json").write_text(json.dumps({'record': item, 'frames': exported}, separators=(',', ':')), encoding='utf-8')
    conn.close()
    (args.output / 'index.json').write_text(json.dumps(catalog, indent=2), encoding='utf-8')
    (args.output / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'audit': report, 'records': catalog['records']}, indent=2))


if __name__ == '__main__':
    main()
