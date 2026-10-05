"""Temporary Cobalt experiment with loopback-only access and an ephemeral API key."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler

def emit(data):
    print('COBALT_PROBE ' + json.dumps(data), flush=True)

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect)
safe_env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG', 'TMPDIR') if k in os.environ}
base = 'http://127.0.0.1:9001/'
key = str(uuid.uuid4())
process = None
with tempfile.TemporaryDirectory(prefix='cobalt-probe-') as directory:
    key_file = Path(directory) / 'keys.json'
    key_file.write_text(json.dumps({key:{'name':'temporary-probe', 'limit':10,
        'ips':['127.0.0.1'], 'allowedServices':['youtube']}}))
    key_file.chmod(0o600)
    safe_env.update(API_URL=base, API_PORT='9001', API_LISTEN_ADDRESS='127.0.0.1',
        API_KEY_URL=key_file.as_uri(), API_AUTH_REQUIRED='1', CORS_WILDCARD='0',
        API_INSTANCE_COUNT='1', DURATION_LIMIT='1200', NODE_OPTIONS='--max-old-space-size=160')
    try:
        process = subprocess.Popen(['node', 'src/cobalt.js'], cwd='/opt/cobalt', env=safe_env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            try:
                with urlopen(base, timeout=2) as response:
                    info = json.load(response)
                break
            except Exception:
                if process.poll() is not None:
                    raise RuntimeError('cobalt_start_failed')
                time.sleep(1)
        else:
            raise RuntimeError('cobalt_start_timeout')
        # Verify the actual listening socket rather than relying only on an env setting.
        sockets = [line.split()[1] for line in Path('/proc/net/tcp').read_text().splitlines()[1:]
                   if line.split()[1].endswith(':2329') and line.split()[3] == '0A']
        loopback = bool(sockets) and all(s == '0100007F:2329' for s in sockets)
        payload = json.dumps({'url':'https://www.youtube.com/watch?v=Ug1mxpkX-ow',
            'videoQuality':'max', 'downloadMode':'auto', 'localProcessing':'disabled'}).encode()
        headers = {'Content-Type':'application/json', 'Accept':'application/json'}
        blocked = False
        try:
            opener.open(Request(base, data=payload, headers=headers), timeout=10).close()
        except HTTPError as exc:
            blocked = exc.code in (401,403)
        emit({'event':'security_check', 'loopbackOnly':loopback, 'unauthenticatedBlocked':blocked,
              'personalCookiesUsed':False, 'backendKeyInherited':False})
        if not (loopback and blocked):
            raise RuntimeError('security_check_failed')
        emit({'event':'ready', 'version':info.get('cobalt',{}).get('version'), 'client':'IOS'})
        for video_id in ('Ug1mxpkX-ow', 'yMKXB4Js-sQ'):
            result = {'event':'result', 'videoId':video_id, 'client':'IOS', 'success':False,
                      'downloadedBytes':0, 'verifiedVideo':False, 'verifiedAudio':False}
            emit({'event':'testing', 'videoId':video_id})
            try:
                payload = json.dumps({'url':'https://www.youtube.com/watch?v='+video_id,
                    'videoQuality':'max', 'downloadMode':'auto', 'localProcessing':'disabled',
                    'alwaysProxy':True}).encode()
                try:
                    response = opener.open(Request(base, data=payload,
                        headers={**headers,'Authorization':'Api-Key '+key}), timeout=75)
                except HTTPError as exc:
                    response = exc
                with response:
                    result['apiHttpStatus'] = response.status
                    data = json.loads(response.read(65536))
                result['apiStatus'] = data.get('status')
                code = data.get('error',{}).get('code','')
                if isinstance(code,str) and re.fullmatch(r'[a-zA-Z0-9._-]{1,100}',code):
                    result['errorCode'] = code
                if data.get('status') in ('tunnel','redirect'):
                    media_url = data.get('url','')
                    parsed = urlsplit(media_url)
                    if not (parsed.scheme == 'http' and parsed.hostname == '127.0.0.1' and parsed.port == 9001):
                        raise RuntimeError('unexpected_download_host')
                    media_file = Path(directory) / ('video-'+video_id+'.media')
                    deadline = time.monotonic()+120
                    # Never send the API key with the media URL, and never follow redirects.
                    with opener.open(media_url,timeout=20) as stream, media_file.open('wb') as output:
                        while True:
                            chunk = stream.read(256*1024)
                            if not chunk:
                                break
                            result['downloadedBytes'] += len(chunk)
                            if result['downloadedBytes'] > 100*1024*1024 or time.monotonic() > deadline:
                                raise RuntimeError('download_budget_exceeded')
                            output.write(chunk)
                    probe = subprocess.run(['ffprobe','-v','error','-show_entries','stream=codec_type,width,height',
                        '-of','json',str(media_file)],capture_output=True,text=True,timeout=15)
                    if probe.returncode == 0:
                        streams = json.loads(probe.stdout).get('streams',[])
                        result['verifiedVideo'] = any(s.get('codec_type') == 'video' for s in streams)
                        result['verifiedAudio'] = any(s.get('codec_type') == 'audio' for s in streams)
                        result['dimensions'] = [{k:s[k] for k in ('width','height') if k in s}
                            for s in streams if s.get('codec_type') == 'video']
                    result['success'] = result['verifiedVideo'] and result['verifiedAudio']
            except Exception as exc:
                result['failure'] = str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__
            emit(result)
    except Exception as exc:
        emit({'event':'failed','category':str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__})
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        emit({'event':'finished'})
