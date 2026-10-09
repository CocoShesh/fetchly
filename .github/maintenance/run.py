"""Apply at most one due, pre-reviewed maintenance change without overwriting files."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def report(message):
    print(message)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write(message + '\n')

def choose(plan, state, today):
    if not plan['start'] <= today <= plan['end']:
        return None
    return next((task for task in plan['tasks'] if task['due'] <= today and task['id'] not in state), None)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    plan = json.loads((ROOT / '.github/maintenance/plan.json').read_text())
    state_path = ROOT / '.github/maintenance/state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    today = dt.datetime.now(ZoneInfo('Asia/Manila')).date().isoformat()
    task = choose(plan, state, today)
    if not task:
        report('No pending change due in the 30-day window. No commit created.')
        return
    if git('status', '--porcelain'):
        raise RuntimeError('Checkout is not clean; refusing to apply a scheduled change.')
    # Never replace a file introduced by another contributor, even if identical.
    for name, content in task['files'].items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or str(path).startswith('.git/'):
            raise RuntimeError('Unsafe destination path.')
        if (ROOT / name).exists():
            report('SKIP: destination already exists: ' + name + '. No files overwritten.')
            return
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError('Empty planned content.')
    for name, expected in task['source_hashes'].items():
        path = ROOT / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            report('SKIP: relevant source changed: ' + name + '. Plan needs review. No commit created.')
            return
    if not args.apply:
        report('Dry run OK: ' + task['title'] + '. No files changed.')
        return
    for name, content in task['files'].items():
        path = ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    preflight = ROOT / 'scripts/source-preflight.py'
    if preflight.exists():
        subprocess.run(['python3', str(preflight)], cwd=ROOT, check=True)
    state[task['id']] = {'date': today, 'title': task['title']}
    state_path.write_text(json.dumps(state, indent=2) + '\n')
    git('add', '--', *task['files'].keys(), '.github/maintenance/state.json')
    git('diff', '--cached', '--check')
    git('-c', 'user.name=CocoShesh', '-c', 'user.email=110368170+CocoShesh@users.noreply.github.com',
        'commit', '-m', task['title'])
    # A regular push fails safely if another writer advances the default branch.
    git('push', 'origin', 'HEAD:' + os.environ['DEFAULT_BRANCH'])
    report('Published: ' + task['title'] + ' (' + git('rev-parse', '--short', 'HEAD') + ')')

if __name__ == '__main__':
    main()
