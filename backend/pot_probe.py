"""Bounded Render experiment; no personal cookies or backend keys in child processes."""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen

def emit(data):
    print('POT_PROBE ' + json.dumps(data), flush=True)

safe_env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG', 'TMPDIR') if k in os.environ}
provider = subprocess.Popen(['node', '/opt/bgutil/build/main.js', '--host', '127.0.0.1'],
    cwd='/opt/bgutil', env=safe_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    start_new_session=True)
results = []
try:
    for _ in range(30):
        try:
            with urlopen('http://127.0.0.1:4416/ping', timeout=2) as response:
                ping = json.load(response)
            emit({'event':'provider_ready', 'version':ping.get('version')})
            break
        except Exception:
            if provider.poll() is not None:
                raise RuntimeError('provider_start_failed')
            time.sleep(1)
    else:
        raise RuntimeError('provider_start_timeout')
    for video_id in ('Ug1mxpkX-ow', 'yMKXB4Js-sQ'):
        emit({'event':'testing', 'videoId':video_id})
        direct_token = False
        token_status = 'not_requested'
        try:
            req = Request('http://127.0.0.1:4416/get_pot',
                data=json.dumps({'content_binding':video_id}).encode(),
                headers={'Content-Type':'application/json'})
            with urlopen(req, timeout=45) as response:
                direct_token = bool(json.load(response).get('poToken'))
            token_status = 'generated' if direct_token else 'empty'
        except Exception as exc:
            token_status = type(exc).__name__
        emit({'event':'token_check', 'videoId':video_id, 'generated':direct_token, 'status':token_status})
        with tempfile.TemporaryDirectory(prefix='pot-probe-') as directory:
            cmd = ['/opt/media/bin/python', '-m', 'yt_dlp', '-v', '--no-playlist',
                '--js-runtimes', 'node', '--socket-timeout', '15', '--retries', '0',
                '--extractor-retries', '0', '--no-progress', '--max-filesize', '100M',
                '--extractor-args', 'youtube:player_client=mweb,tv,web_safari;fetch_pot=always',
                '--extractor-args', 'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416',
                '-f', 'bv*+ba/b', '--merge-output-format', 'mkv', '-o', directory + '/media.%(ext)s',
                'https://www.youtube.com/watch?v=' + video_id]
            try:
                run = subprocess.run(cmd, env=safe_env, capture_output=True, text=True, timeout=210)
                output = run.stdout + run.stderr
                low = output.lower()
                result = {'event':'result', 'videoId':video_id, 'returncode':run.returncode,
                    'providerLoaded':'bgutil:http-2.0.1' in output,
                    'tokenGenerationAttempted':'generating a' in low and 'po token' in low,
                    'tokenRetrieved':'retrieved a' in low and 'po token' in low,
                    'directTokenGenerated':direct_token, 'directTokenStatus':token_status,
                    'botVerification':'not a bot' in low, 'http403':'403' in low,
                    'downloadedBytes':0, 'verifiedVideo':False, 'verifiedAudio':False}
                for file in Path(directory).glob('media.*'):
                    if file.suffix in ('.part', '.ytdl'):
                        continue
                    check = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                        'stream=codec_type', '-of', 'json', str(file)], capture_output=True, text=True, timeout=15)
                    if check.returncode == 0:
                        types = {s.get('codec_type') for s in json.loads(check.stdout).get('streams', [])}
                        result['verifiedVideo'] |= 'video' in types
                        result['verifiedAudio'] |= 'audio' in types
                        result['downloadedBytes'] += file.stat().st_size
                result['success'] = run.returncode == 0 and result['verifiedVideo'] and result['verifiedAudio']
                # Only fixed diagnostic labels; no raw signed URLs, tokens, cookies, or secrets.
                result['errors'] = [label for label, needle in (
                    ('bot_verification','not a bot'), ('missing_formats','requested format is not available'),
                    ('provider_failure','failed to generate'), ('file_limit','larger than max-filesize'),
                    ('token_request_failed','failed to fetch'), ('http_403','http error 403')) if needle in low]
            except subprocess.TimeoutExpired:
                result = {'event':'result', 'videoId':video_id, 'success':False, 'error':'download_timeout', 'directTokenGenerated':direct_token}
            results.append(result)
            emit(result)
except Exception as exc:
    emit({'event':'probe_failed', 'errorType':type(exc).__name__, 'category':str(exc) if isinstance(exc, RuntimeError) else 'unexpected'})
finally:
    if provider.poll() is None:
        os.killpg(provider.pid, signal.SIGTERM)
        try:
            provider.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(provider.pid, signal.SIGKILL)
            provider.wait()
    emit({'event':'finished', 'count':len(results)})
