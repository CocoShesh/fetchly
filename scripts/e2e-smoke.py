"""Local API smoke test with synthetic extraction; no claims of live site coverage."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request

os.environ['NO_PROXY'] = os.environ['no_proxy'] = '127.0.0.1,localhost'
os.environ['MEDIA_BACKEND_URL'] = 'http://127.0.0.1:8787'
os.environ['MEDIA_BACKEND_KEY'] = 'test-only-secret-' + 'x' * 40
spec = importlib.util.spec_from_file_location('media', Path(__file__).parents[1] / 'backend/server.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)

def fake_resolve(url):
    media.validate_url(url)
    token = 'a' * 32
    media.ITEMS[token] = {'source': url, 'selection': None, 'kind': 'video', 'title': 'fixture', 'expires': time.time() + 60}
    return {'title': 'fixture', 'sourceUrl': url, 'items': [{'id': token, 'url': token, 'kind': 'video', 'ext': 'mp4', 'label': 'Video'}]}

def fake_worker(job, item):
    folder = media.ROOT / job
    folder.mkdir()
    source = folder / 'source.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.3', '-c:v', 'libx264', '-c:a', 'aac', str(source)], check=True)
    target = folder / 'media.mp4'
    media.normalize_media(source, target, 'video')
    media.JOBS[job].update({'status': 'ready', 'path': str(target)})

media.resolve, media.worker = fake_resolve, fake_worker
server = media.ThreadingHTTPServer(('127.0.0.1', 8787), media.Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
root = Path(__file__).parents[1]
next_process = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3099'], cwd=root, env=os.environ.copy(), stdout=None, stderr=None)

def request(path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request('http://127.0.0.1:3099' + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=5) as res:
            return res.status, res.headers, res.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read()

try:
    for _ in range(10):
        try:
            request('/api/download?job=invalid'); break
        except OSError as exc:
            print("Waiting for Next.js:", type(exc).__name__, flush=True)
            time.sleep(0.2)
    status, _, payload = request('/api/resolve', {'url': 'https://x.com/user/status/1'})
    assert status == 200, payload
    token = json.loads(payload)['items'][0]['url']
    status, _, payload = request('/api/download', {'token': token})
    assert status == 200, payload
    job = json.loads(payload)['job']
    for _ in range(100):
        status, _, payload = request('/api/download?job=' + job + '&status=1')
        if json.loads(payload)['status'] == 'ready': break
        time.sleep(0.1)
    status, headers, payload = request('/api/download?job=' + job + '&filename=test')
    assert status == 200 and headers['Content-Type'] == 'video/mp4'
    assert payload[4:8] == b'ftyp' and 'attachment' in headers['Content-Disposition']
    status, headers, payload = request('/api/download?src=https://x.com/error.json')
    assert status == 400 and headers['Content-Type'].startswith('application/json')
    assert not headers.get('Content-Disposition')
    status, _, _ = request('/api/resolve', {'url': 'https://youtube.com.evil.com/video'})
    assert status == 422
    status, _, _ = request('/api/download?job=' + 'z' * 32)
    assert status == 404
    print('PASS: resolve → prepare → poll → MP4 with audio; JSON/error and hostile host rejection.')
finally:
    next_process.terminate()
    next_process.wait(timeout=10)
    server.shutdown()
    server.server_close()
    media.POOL.shutdown(wait=True)
    shutil.rmtree(media.ROOT, ignore_errors=True)
