#!/usr/bin/env python3
"""Read-only process sampling for the local desktop-pet soak check."""
import argparse, csv, datetime, pathlib, subprocess, time
parser = argparse.ArgumentParser()
parser.add_argument('pid', type=int)
parser.add_argument('--minutes', type=int, default=30)
parser.add_argument('--output', default='build/QA/process-samples.csv')
args = parser.parse_args()
out = pathlib.Path(args.output); out.parent.mkdir(parents=True, exist_ok=True)
with out.open('w') as file:
    writer = csv.writer(file)
    writer.writerow(['time', 'elapsed_seconds', 'pid', 'cpu_percent', 'rss_kib'])
    started = time.monotonic()
    for sample in range(args.minutes + 1):
        if sample: time.sleep(max(0, started + sample * 60 - time.monotonic()))
        result = subprocess.run(['ps', '-p', str(args.pid), '-o', 'pid=,%cpu=,rss='], text=True, capture_output=True)
        if result.returncode or not result.stdout.strip():
            raise SystemExit('Observed app process exited; soak check incomplete.')
        pid, cpu, rss = result.stdout.split()
        writer.writerow([datetime.datetime.now().isoformat(timespec='seconds'), round(time.monotonic()-started), pid, cpu, rss])
        file.flush()
print(f'Completed {args.minutes}-minute process observation: {out}')
