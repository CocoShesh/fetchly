"""Admin-only staged package upgrades; activate with a clean process restart."""
import importlib.metadata
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading

DIRECTORY = Path(os.environ.get('FETCHLY_ENGINE_DIR', '/app/engines'))
STATE = {'status': 'idle'}
LOCK = threading.Lock()


def activate_path():
    marker = DIRECTORY / 'current.json'
    if marker.is_file():
        try:
            name = json.loads(marker.read_text())['release']
            if isinstance(name, str) and name.startswith('release-') and '/' not in name:
                path = DIRECTORY / name
                if path.is_dir():
                    sys.path.insert(0, str(path))
        except (ValueError, OSError, KeyError):
            pass


def info():
    versions = {}
    for package in ('yt-dlp', 'gallery-dl', 'instaloader'):
        try:
            versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            versions[package] = 'Not installed'
    with LOCK:
        state = dict(STATE)
    return {**state, 'versions': versions, 'adminEnabled': len(os.environ.get('FETCHLY_ADMIN_KEY', '')) >= 32}


def start(restart):
    with LOCK:
        if STATE['status'] == 'updating':
            raise ValueError('An engine update is already running.')
        STATE.clear()
        STATE.update(status='updating')
    def run():
        release = DIRECTORY / ('release-' + secrets.token_hex(8))
        previous = None
        activated = False
        try:
            DIRECTORY.mkdir(parents=True, exist_ok=True)
            release.mkdir()
            cmd = [sys.executable, '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', '--no-cache-dir',
                   '--index-url', 'https://pypi.org/simple', '--only-binary', ':all:', '--target', str(release),
                   'yt-dlp[default,curl-cffi]', 'gallery-dl', 'instaloader']
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           stdin=subprocess.DEVNULL, timeout=240)
            # Import checks in a fresh interpreter, before activation.
            subprocess.run([sys.executable, '-c', 'import yt_dlp, gallery_dl, instaloader'],
                           env={**os.environ, 'PYTHONPATH': str(release)}, check=True, timeout=20,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            marker = DIRECTORY / 'current.json'
            previous = marker.read_bytes() if marker.exists() else None
            pending = DIRECTORY / 'pending.json'
            pending.write_text(json.dumps({'release': release.name}))
            pending.replace(DIRECTORY / 'current.json')
            activated = True
            with LOCK:
                STATE.update(status='restarting')
            restart()
        except Exception:
            if activated:
                if previous is not None:
                    (DIRECTORY / 'current.json').write_bytes(previous)
                else:
                    (DIRECTORY / 'current.json').unlink(missing_ok=True)
            shutil.rmtree(release, ignore_errors=True)
            with LOCK:
                STATE.update(status='error', error='Engine update failed. Existing engines remain available; check server package connectivity and storage permissions.')
    threading.Thread(target=run, daemon=True).start()
    return {'status': 'updating'}
