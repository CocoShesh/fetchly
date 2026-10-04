"""Private extraction service. Run behind the Next.js API, never expose directly."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine_manager import activate_path
activate_path()
import engine_manager
import concurrent.futures
import zipfile
import http.cookiejar
import itertools
from contextlib import contextmanager
import hmac
import json
import logging
import os
import re
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

HOSTS = ('youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'pinterest.com', 'pin.it', 'reddit.com', 'redd.it', 'flickr.com')
KEY = os.environ.get('MEDIA_BACKEND_KEY', '')
TTL = 1800
MAX_BYTES = int(os.environ.get('MAX_DOWNLOAD_BYTES', '524288000'))
ROOT = Path(tempfile.mkdtemp(prefix='fetchly-'))
LOCK = threading.Lock()
RESOLVERS = threading.BoundedSemaphore(2)
ITEMS, JOBS = {}, {}
SESSIONS = {}
AUDIO_FORMATS = {"mp3": ("libmp3lame", ["-q:a", "2"], "audio/mpeg"), "m4a": ("aac", ["-b:a", "256k"], "audio/mp4"), "flac": ("flac", [], "audio/flac"), "opus": ("libopus", ["-b:a", "160k"], "audio/ogg")}
MIME = {"mp4": "video/mp4", "webm": "video/webm", "mkv": "video/x-matroska", "zip": "application/zip", "jpg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp", **{ext: v[2] for ext, v in AUDIO_FORMATS.items()}}
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)
def validate_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Enter a valid supported link.')
    value = value.strip()
    if '://' not in value:
        value = 'https://' + value
    u = urlsplit(value)
    if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443):
        raise ValueError('Use an HTTPS social media link without credentials or a custom port.')
    host = (u.hostname or '').lower()
    if not any(host == h or host.endswith('.' + h) for h in HOSTS):
        raise ValueError('Use a supported media platform link.')
    return value


class SilentExtractorLogger:
    def debug(self, *_): pass
    def warning(self, *_): pass
    def error(self, *_): pass


@contextmanager
def ytdlp_options(url=None, session=None):
    opts = {'quiet': True, 'no_warnings': True, 'socket_timeout': 20,
            'retries': 2, 'fragment_retries': 2, 'noplaylist': True,
            'playlistend': 10, 'extractor_retries': 1, 'cachedir': False, 'js_runtimes': {'node': {}},
            'max_filesize': MAX_BYTES, 'logger': SilentExtractorLogger()}
    tiktok = bool(url and platform_key(url) == 'tiktok.com')
    if tiktok:
        # TikTok may challenge server requests. Browser impersonation helps on some networks,
        # but cannot guarantee access to posts or downloadable media.
        opts['impersonate'] = 'chrome'

    cookie_copy = None
    try:
        cookies = os.environ.get('TIKTOK_COOKIES_FILE') if tiktok and not session and os.environ.get('FETCHLY_PRIVATE_MODE') == '1' else None
        if cookies:
            source = Path(cookies)
            if not source.is_file() or not os.access(source, os.R_OK) or source.stat().st_size > 1024 * 1024:
                raise ValueError('The configured TikTok cookie file is missing, unreadable, or larger than 1 MiB.')
            content = source.read_text(encoding='utf-8')
            lines = content.splitlines()
            if not lines or lines[0].strip() not in ('# Netscape HTTP Cookie File', '# HTTP Cookie File'):
                raise ValueError('The TikTok cookie file must use Netscape cookie format.')
            # Keep only TikTok-domain cookies so unrelated browser sessions never go upstream.
            safe_lines = [lines[0]]
            for line in lines[1:]:
                if not line or line.startswith('#') and not line.startswith('#HttpOnly_'):
                    continue
                fields = line.split('\t')
                if len(fields) != 7:
                    continue
                domain = fields[0].removeprefix('#HttpOnly_').lstrip('.').lower()
                if domain == 'tiktok.com' or domain.endswith('.tiktok.com'):
                    safe_lines.append(line)
            if len(safe_lines) == 1:
                raise ValueError('The configured cookie file contains no TikTok-domain cookies.')
            cookie_copy = ROOT / f'tiktok-cookies-{secrets.token_urlsafe(12)}.txt'
            cookie_copy.write_text('\n'.join(safe_lines) + '\n', encoding='utf-8')
            cookie_copy.chmod(0o600)
            opts['cookiefile'] = str(cookie_copy)
        if session:
            with LOCK:
                entry = SESSIONS.get(session)
                if not entry or entry['expires'] < time.time():
                    raise ValueError('Cookie session expired. Import your cookies again.')
                session_data = entry['data']
            if cookie_copy:
                cookie_copy.unlink(missing_ok=True)
            fd, cookie_name = tempfile.mkstemp(prefix='session-', suffix='.txt', dir=ROOT)
            with os.fdopen(fd, 'w') as jar:
                jar.write(session_data)
            cookie_copy = Path(cookie_name)
            opts['cookiefile'] = str(cookie_copy)
        yield opts
    finally:
        if cookie_copy:
            cookie_copy.unlink(missing_ok=True)


def tiktok_oembed_preview(url):
    """Return official TikTok metadata when yt-dlp cannot extract downloadable streams."""
    endpoint = 'https://www.tiktok.com/oembed?' + urlencode({'url': url})
    request = Request(endpoint, headers={
        'Accept': 'application/json',
        'User-Agent': 'Fetchly/1.0',
    })
    with urlopen(request, timeout=8) as response:
        raw = response.read(512 * 1024 + 1)
    if len(raw) > 512 * 1024:
        raise ValueError('TikTok returned an oversized preview response.')
    data = json.loads(raw)
    title = data.get('title')
    if not isinstance(title, str) or not title.strip():
        raise ValueError('TikTok did not return preview metadata.')
    thumbnail = data.get('thumbnail_url')
    author = data.get('author_name')
    return {
        'title': title.strip()[:300],
        'author': author.strip()[:100] if isinstance(author, str) else None,
        'thumbnail': thumbnail if isinstance(thumbnail, str) and thumbnail.startswith('https://') else None,
        'sourceUrl': url,
        'items': [],
        'previewOnly': True,
        'previewMessage': 'TikTok provided an official preview, but its public API does not provide a downloadable video file. Open TikTok to watch or use its Save video option when the creator allows it.',
    }


def error_kind(exc):
    message = str(exc).lower()
    if '429' in message or 'too many requests' in message or 'rate limit' in message:
        return 'rate_limited'
    if 'private' in message or 'login' in message or 'sign in' in message or 'cookies' in message or 'authentication' in message:
        return 'authentication'
    if '403' in message or 'forbidden' in message or 'blocked' in message:
        return 'blocked'
    if 'timed out' in message or 'timeout' in message:
        return 'timeout'
    if 'unsupported' in message:
        return 'unsupported'
    if 'size limit' in message or 'exceeds size' in message:
        return 'size_limit'
    return 'unavailable'


def public_error(exc):
    kind = error_kind(exc)
    if kind == 'authentication':
        return 'This post appears to require login. A private, single-user Fetchly instance can optionally use its own TikTok cookie file, but cookies do not guarantee access. Otherwise, open the post in TikTok and use Save video if the creator allows it.'
    if kind == 'rate_limited':
        return 'The platform is rate-limiting the downloader (HTTP 429). You can retry, but the platform may continue to refuse requests.'
    if kind == 'blocked':
        return 'The platform refused the server request (HTTP 403). A TikTok cookie file may help on a private, single-user Fetchly instance, but TikTok can still refuse the server. Open the post in TikTok and use Save video if the creator allows it.'
    if kind == 'timeout':
        return 'The platform did not respond in time. Wait a moment and try once more.'
    if kind == 'unsupported':
        return 'This link or post type is not supported by the current extractor. Try a video post permalink.'
    if kind == 'size_limit':
        return 'This media exceeds the configured download size limit.'
    return 'Media extraction failed. The post may be unavailable, restricted, or require an extractor update.'


def platform_key(url):
    host = (urlsplit(url).hostname or '').lower()
    return next((domain for domain in HOSTS if host == domain or host.endswith('.' + domain)), host)


def highest_video_quality(formats):
    videos = [f for f in formats if f.get('vcodec') not in (None, 'none')]
    if not videos:
        return 'Highest available source'
    best = max(videos, key=lambda f: (f.get('height') or 0, f.get('fps') or 0, f.get('tbr') or 0))
    height = best.get('height')
    fps = best.get('fps')
    detail = f"{height}p" if height else 'highest source format'
    if fps:
        detail += f" · {fps:g} fps"
    return f'Highest available · {detail}'


def resolve_tiktok_page(url):
    from tiktok_page import extract
    post, height = extract(url)
    items = []
    for kind in ('video', 'audio'):
        token = secrets.token_urlsafe(24)
        with LOCK:
            ITEMS[token] = {'source': url, 'selection': None, 'kind': kind,
                            'extractor': 'tiktok_page', 'title': post.get('desc') or 'TikTok video',
                            'expires': time.time() + TTL}
        items.append({'id': token, 'url': token, 'kind': kind, 'entryId': '0', 'entryTitle': post.get('desc') or 'TikTok video',
                      'ext': 'mp4' if kind == 'video' else 'mp3',
                      'label': 'Video with audio' if kind == 'video' else 'Audio only',
                      'quality': (f'{height}p' if height else 'Available source') if kind == 'video' else 'Source audio',
                      'badge': 'Best quality' if kind == 'video' else None})
    author = post.get('author') or {}
    return {'title': post.get('desc') or 'TikTok video', 'author': author.get('nickname') or author.get('uniqueId'),
            'thumbnail': post['video'].get('cover'), 'duration': post['video'].get('duration'),
            'sourceUrl': url, 'items': items}


def resolve(url, options=None):
    import yt_dlp
    url = validate_url(url)
    options = options or {}
    if not isinstance(options, dict):
        raise ValueError('Invalid download options.')
    session = options.get('cookieSession')
    if session is not None and not isinstance(session, str):
        raise ValueError('Invalid cookie session.')
    if session:
        with LOCK:
            if session not in SESSIONS or SESSIONS[session]['expires'] < time.time():
                raise ValueError('Cookie session expired. Import your cookies again.')
    batch = bool(options.get('playlist'))
    offset = max(0, min(int(options.get('offset', 0)), 10000))
    page_size = 20
    if engine_manager.info()['status'] in ('updating', 'restarting'):
        raise ValueError('Server engines are updating. Try again after the restart.')
    if options.get('gallery'):
        if platform_key(url) == 'instagram.com' and options.get('galleryEngine') != 'gallery-dl':
            try:
                return resolve_gallery(url, session, offset, page_size)
            except Exception:
                if options.get('galleryEngine') == 'instaloader':
                    raise
                logging.info('Trying Instagram gallery-dl fallback')
        return resolve_gallery_engine(url, session, offset, page_size)
    try:
        with ytdlp_options(url, session) as opts:
            opts.update({'noplaylist': not batch, 'playliststart': offset + 1, 'playlistend': offset + page_size, 'ignoreerrors': batch})
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
    except Exception:
        if platform_key(url) != 'tiktok.com':
            raise
        logging.info('Trying TikTok public page fallback')
        return resolve_tiktok_page(url)
    entries = info.get('entries') if info.get('_type') in ('playlist', 'multi_video') else [info]
    items = []
    for index, entry in enumerate(entries or []):
        if not entry:
            continue
        if entry.get('is_live'):
            continue
        formats = entry.get('formats') or []
        has_video = any(f.get('vcodec') not in (None, 'none') for f in formats)
        has_audio = any(f.get('acodec') not in (None, 'none') for f in formats)
        source = validate_url(entry.get('webpage_url') or url)
        # Playlist entries use individual permalinks. Carousels retain entry selection.
        selection = (entry.get('playlist_index') or index + offset + 1) if info.get('_type') == 'multi_video' else None
        heights = sorted({int(f['height']) for f in formats
                          if f.get('vcodec') not in (None, 'none') and isinstance(f.get('height'), (int, float))}, reverse=True)
        # Keep the menu useful on posts with many codec/bitrate variants while always
        # including the top source resolution first.
        video_choices = heights or [None]
        for kind in (['video'] if has_video else []) + (['audio'] if has_audio else []):
            choices = video_choices if kind == 'video' else [None]
            for height in choices:
                token = secrets.token_urlsafe(24)
                selector = (f'bestvideo[height<={height}]+bestaudio/best[height<={height}]/best'
                            if height else 'bestvideo+bestaudio/best') if kind == 'video' else 'bestaudio/best'
                fps = max((f.get('fps') or 0 for f in formats
                           if height and f.get('height') == height and f.get('vcodec') not in (None, 'none')), default=0)
                quality = (f'{height}p' + (f' · up to {fps:g} fps' if fps else '') if height
                           else highest_video_quality(formats)) if kind == 'video' else 'Highest available audio'
                with LOCK:
                    ITEMS[token] = {'source': source, 'selection': selection, 'kind': kind,
                                    'format': selector, 'author': entry.get('uploader') or '', 'title': entry.get('title') or 'download',
                                    'expires': time.time() + TTL, 'session': session}
                items.append({'id': token, 'url': token, 'kind': kind, 'entryId': str(index + offset), 'entryTitle': entry.get('title') or 'Media', 'sourceUrl': source,
                              'ext': 'mp4' if kind == 'video' else 'mp3',
                              'label': ((f'Video with audio · {height}p' if height else 'Video with audio') if kind == 'video' else 'Audio only') + (f' · item {index + 1}' if selection else ''),
                              'quality': quality, 'badge': 'Best quality' if kind == 'video' and height == video_choices[0] else None})
        # Exact IDs are issued by the server; clients cannot submit arbitrary selectors.
        for f in sorted(formats, key=lambda f: (f.get('height') or 0, f.get('fps') or 0, f.get('tbr') or 0), reverse=True)[:80]:
            format_id = str(f.get('format_id') or '')
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', format_id) or f.get('vcodec') in (None, 'none'):
                continue
            height = f.get('height') or 0
            fps = f.get('fps') or 0
            codec = f.get('vcodec') or ''
            for stream in ('combined', 'video-only'):
                token = secrets.token_urlsafe(24)
                selector = format_id if stream == 'video-only' or f.get('acodec') not in (None, 'none') else format_id + '+bestaudio'
                with LOCK:
                    ITEMS[token] = {'source': source, 'selection': selection, 'kind': 'video', 'format': selector,
                                    'streamMode': stream, 'author': entry.get('uploader') or '', 'title': entry.get('title') or 'download', 'expires': time.time() + TTL, 'session': session}
                detail = f"{height}p · {fps:g} fps · {codec} · {f.get('ext') or 'source'} · ID {format_id}"
                items.append({'id': token, 'url': token, 'kind': 'video', 'ext': 'mp4', 'entryId': str(index + offset),
                              'entryTitle': entry.get('title') or 'Media', 'exact': True, 'formatId': format_id,
                              'streamMode': stream, 'quality': detail, 'label': 'Exact format' if stream == 'combined' else 'Separate video stream',
                              'sourceUrl': source})
        for f in sorted(formats, key=lambda f: f.get('abr') or f.get('tbr') or 0, reverse=True)[:80]:
            format_id = str(f.get('format_id') or '')
            if f.get('vcodec') not in (None, 'none') or f.get('acodec') in (None, 'none') or not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', format_id):
                continue
            token = secrets.token_urlsafe(24)
            with LOCK:
                ITEMS[token] = {'source': source, 'selection': selection, 'kind': 'audio', 'format': format_id,
                                'title': entry.get('title') or 'download', 'expires': time.time() + TTL, 'session': session}
            items.append({'id': token, 'url': token, 'kind': 'audio', 'ext': 'mp3', 'entryId': str(index + offset),
                          'entryTitle': entry.get('title') or 'Media', 'exact': True, 'formatId': format_id, 'sourceUrl': source,
                          'quality': f"{f.get('abr') or f.get('tbr') or 0:g} kbps · {f.get('acodec')} · {f.get('ext')} · ID {format_id}", 'label': 'Exact audio stream'})
    if not items and not batch:
        raise ValueError('No downloadable video/audio was found. Use Instagram photos mode for photo posts. Live streams are not supported.')
    return {'title': info.get('title') or 'Social media video', 'author': info.get('uploader'),
            'thumbnail': info.get('thumbnail'), 'sourceUrl': url, 'duration': info.get('duration'),
            'viewCount': info.get('view_count'), 'description': (info.get('description') or '')[:500], 'items': items, 'collection': bool(info.get('entries')), 'nextOffset': offset + page_size if batch and len(entries or []) >= page_size else None}


def download_instagram_fallback(url, folder):
    """Use Instaloader for a single Instagram video when yt-dlp fails."""
    from instaloader import Instaloader, Post

    match = re.search(r'/(?:p|reel|tv)/([A-Za-z0-9_-]+)', urlsplit(url).path)
    if not match:
        raise ValueError('Instaloader fallback needs a direct Instagram post or Reel URL.')

    output = folder / 'instagram'
    output.mkdir(exist_ok=True)
    loader = Instaloader(
        dirname_pattern=str(output),
        filename_pattern='{shortcode}',
        download_pictures=False,
        download_videos=True,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        post_metadata_txt_pattern='',
        quiet=True,
        max_connection_attempts=1,
        request_timeout=20,
    )
    post = Post.from_shortcode(loader.context, match.group(1))
    if not post.is_video:
        raise ValueError('Instaloader fallback supports single-video Instagram posts and Reels only.')
    loader.download_post(post, target='post')
    files = sorted(output.rglob('*.mp4'))
    if len(files) != 1:
        raise ValueError('Instaloader did not produce exactly one Instagram video.')
    return files[0]


def normalize_media(source, target, kind, audio_format="mp3", muted=False):
    if audio_format not in AUDIO_FORMATS:
        raise ValueError("Unsupported audio format.")
    # Preserve the selected source video when MP4 can carry its codec. Transcode
    # only if the source codec or MP4 muxer is incompatible.
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name',
                            '-of', 'json', str(source)], check=True, capture_output=True, timeout=20)
    streams = json.loads(probe.stdout).get('streams', [])
    if kind == 'video':
        video = next((s for s in streams if s.get('codec_type') == 'video'), None)
        if not video:
            raise ValueError('No video stream was found.')
        audio = next((s for s in streams if s.get('codec_type') == 'audio'), None)
        copy_video = target.suffix == '.mkv' or video.get('codec_name') in {'h264', 'hevc', 'av1', 'vp9'}
        copy_audio = target.suffix == '.mkv' or audio is None or audio.get('codec_name') == 'aac'
        args = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                '-map', '0:v:0'] + ([] if muted else ['-map', '0:a:0?'])
        if copy_video:
            args += ['-c:v', 'copy']
        else:
            args += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                     '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p']
        if copy_audio:
            args += ['-c:a', 'copy']
        else:
            args += ['-c:a', 'aac', '-b:a', '256k']
        args += (['-movflags', '+faststart'] if target.suffix == '.mp4' else []) + ['-fs', str(MAX_BYTES + 1), str(target)]
        try:
            subprocess.run(args, check=True, capture_output=True, timeout=600)
        except subprocess.CalledProcessError:
            if not copy_video:
                raise
            target.unlink(missing_ok=True)
            fallback = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                        '-map', '0:v:0', *([] if muted else ['-map', '0:a:0?']), '-c:v', 'libx264', '-preset', 'veryfast',
                        '-crf', '18', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-fs', str(MAX_BYTES + 1), str(target)]
            subprocess.run(fallback, check=True, capture_output=True, timeout=600)
    else:
        audio = next((stream for stream in streams if stream.get('codec_type') == 'audio'), None)
        if not audio:
            raise ValueError('No audio stream was found.')
        codecs = {'mp3': 'mp3', 'm4a': 'aac', 'flac': 'flac', 'opus': 'opus'}
        encoding = ['-c:a', 'copy'] if audio.get('codec_name') == codecs[audio_format] else ['-c:a', AUDIO_FORMATS[audio_format][0], *AUDIO_FORMATS[audio_format][1]]
        args = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                '-map', '0:a:0', '-vn', *encoding, '-fs', str(MAX_BYTES + 1), str(target)]
        subprocess.run(args, check=True, capture_output=True, timeout=600)

    if not target.exists() or not 0 < target.stat().st_size <= MAX_BYTES:
        raise ValueError('The output exceeds the configured size limit.')
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type',
                             '-of', 'json', str(target)], check=True, capture_output=True, timeout=20)
    output_streams = json.loads(result.stdout).get('streams', [])
    if not any(s.get('codec_type') == kind for s in output_streams):
        raise ValueError('No valid media stream was produced.')


def worker(job_id, item):
    folder = ROOT / job_id
    try:
        import yt_dlp
        folder.mkdir(exist_ok=True)
        if item['kind'] == 'image':
            ext = item.get('imageExt', 'jpg')
            source_file = download_gallery_image(item, folder / ('media.' + ext))
            with LOCK:
                JOBS[job_id].update({'status': 'ready', 'path': str(source_file), 'ext': ext, 'expires': time.time() + TTL})
            return
        try:
            if item.get('extractor') == 'tiktok_page':
                from tiktok_page import download
                download(item['source'], folder / 'source.mp4', MAX_BYTES, JOBS[job_id]['deadline'])
            else:
                download_with_ytdlp(item, folder, job_id)
            files = [p for p in folder.glob('source.*') if p.suffix not in ('.part', '.ytdl', '.json')]
            if len(files) != 1:
                raise ValueError('Expected one media file.')
            source_file = files[0]
        except Exception as yt_error:
            if platform_key(item['source']) == 'tiktok.com' and item.get('extractor') != 'tiktok_page':
                from tiktok_page import download
                source_file = download(item['source'], folder / 'fallback.mp4', MAX_BYTES, JOBS[job_id]['deadline'])
            elif platform_key(item['source']) == 'instagram.com' and error_kind(yt_error) not in ('blocked', 'rate_limited'):
                source_file = download_instagram_fallback(item['source'], folder)
            else:
                raise
        ext = item.get('videoFormat', 'mp4') if item['kind'] == 'video' else item.get('audioFormat', 'mp3')
        target = folder / ('media.' + ext)
        normalize_media(source_file, target, item['kind'], item.get('audioFormat', 'mp3'), item.get('muted', False) or item.get('streamMode') == 'video-only')
        source_file.unlink(missing_ok=True)
        shutil.rmtree(folder / 'instagram', ignore_errors=True)
        with LOCK:
            JOBS[job_id].update({'status': 'ready', 'path': str(target), 'ext': ext, 'expires': time.time() + TTL})
    except Exception as exc:
        kind = error_kind(exc)
        logging.warning('media job failed: platform=%s category=%s', platform_key(item['source']), kind)
        with LOCK:
            JOBS[job_id].update({'status': 'error', 'error': str(exc) if isinstance(exc, ValueError) else public_error(exc), 'expires': time.time() + TTL})
        # Keep source .part/.ytdl files for a retry; never offer partial output as ready.
        for partial_output in folder.glob('media.*'):
            partial_output.unlink(missing_ok=True)


def download_with_ytdlp(item, folder, job_id):
    import yt_dlp
    with ytdlp_options(item['source'], item.get('session')) as opts:
        opts.update({'outtmpl': str(folder / 'source.%(ext)s'),
                         'format': ((item.get('format') or 'bestvideo+bestaudio/best').replace('+bestaudio', '') if item.get('muted') and item['kind'] == 'video' else item.get('format') or ('bestvideo+bestaudio/best' if item['kind'] == 'video' else 'bestaudio/best')),
                         'merge_output_format': 'mkv', 'overwrites': False, 'continuedl': True, 'retries': item.get('networkRetries', 2), 'fragment_retries': item.get('networkRetries', 2), 'ratelimit': (item.get('rateLimitKiB', 0) * 1024) or None, 'concurrent_fragment_downloads': item.get('fragments', 1)})
        if item['selection']:
            opts.update({'noplaylist': False, 'playlist_items': str(item['selection'])})
        def limit(progress):
            if progress.get('downloaded_bytes', 0) > MAX_BYTES:
                raise ValueError('Download exceeds size limit.')
            if time.time() > JOBS[job_id]['deadline']:
                raise ValueError('Download timed out.')
        opts['progress_hooks'] = [limit]
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([item['source']])


def start_job(token, options=None):
    options = options or {}
    if not isinstance(options, dict):
        raise ValueError('Invalid download options.')
    if not isinstance(token, str):
        raise ValueError('Invalid media token.')
    audio_format = options.get("audioFormat", "mp3")
    if audio_format not in AUDIO_FORMATS:
        raise ValueError("Unsupported audio format.")
    with LOCK:
        item = ITEMS.get(token)
        if not item or item['expires'] < time.time():
            raise ValueError('This result expired. Paste the link again.')
        item = dict(item)
        if options.get('videoFormat', 'mp4') not in ('mp4', 'mkv'):
            raise ValueError('Unsupported video container.')
        item.update({'networkRetries': max(0, min(int(options.get('networkRetries', 2)), 5)), 'rateLimitKiB': max(0, min(int(options.get('rateLimitKiB', 0)), 1000000)), 'muted': options.get('videoMode') == 'muted', 'videoFormat': options.get('videoFormat', 'mp4'), 'audioFormat': audio_format, 'fragments': max(1, min(int(options.get('fragments', 1)), 4))})
    with LOCK:
        if engine_manager.info()['status'] in ('updating', 'restarting'):
            raise ValueError('Engines are updating. Try again after the restart.')
        if sum(j['status'] == 'processing' for j in JOBS.values()) >= 4:
            raise ValueError('The downloader is busy. Please try again shortly.')
        job_id = secrets.token_urlsafe(24)
        JOBS[job_id] = {'status': 'processing', 'kind': item['kind'], 'title': item['title'],
                        'expires': time.time() + TTL, 'deadline': time.time() + 900, 'item': item}
    try:
        POOL.submit(worker, job_id, item)
    except RuntimeError:
        with LOCK:
            JOBS.pop(job_id, None)
        raise ValueError('The media service is restarting. Please try again in a moment.')
    return {'job': job_id, 'status': 'processing'}


def cleanup():
    while True:
        time.sleep(60)
        with LOCK:
            for token, session in list(SESSIONS.items()):
                if session['expires'] < time.time():
                    SESSIONS.pop(token, None)
            for mapping in (ITEMS, JOBS):
                for token, entry in list(mapping.items()):
                    if entry.get('parent') and entry['parent'] in JOBS:
                        continue
                    if entry['expires'] < time.time() and entry.get('status') != 'processing':
                        mapping.pop(token, None)
                        if mapping is JOBS:
                            shutil.rmtree(ROOT / token, ignore_errors=True)
                            for child in entry.get('children', []):
                                mapping.pop(child, None)
                                shutil.rmtree(ROOT / child, ignore_errors=True)


def import_cookies(data):
    if not isinstance(data, str) or len(data.encode()) > 750000 or not data.startswith(('# Netscape HTTP Cookie File', '# HTTP Cookie File')):
        raise ValueError('Import a Netscape cookies.txt file, up to 750 KB.')
    allowed = []
    for line in data.splitlines()[1:]:
        if not line or (line.startswith('#') and not line.startswith('#HttpOnly_')):
            continue
        parts = line.removeprefix('#HttpOnly_').split('\t')
        if len(parts) != 7:
            raise ValueError('Invalid cookie record.')
        if parts[1] not in ('TRUE', 'FALSE') or parts[3] not in ('TRUE', 'FALSE') or (parts[4] and not parts[4].isdigit()) or not parts[2].startswith('/'):
            raise ValueError('Invalid Netscape cookie record.')
        host = parts[0].lstrip('.').lower()
        if any(host == d or host.endswith('.' + d) for d in HOSTS):
            allowed.append(line)
    if not allowed:
        raise ValueError('No cookies for supported platforms were found.')
    token = secrets.token_urlsafe(24)
    with LOCK:
        if len(SESSIONS) >= 100:
            raise ValueError('Cookie sessions are busy. Try again later.')
        SESSIONS[token] = {'data': '# Netscape HTTP Cookie File\n' + '\n'.join(allowed) + '\n', 'expires': time.time() + TTL}
    return {'session': token, 'expiresIn': TTL}


def instagram_loader(session=None):
    from instaloader import Instaloader
    loader = Instaloader(quiet=True, max_connection_attempts=1, request_timeout=20)
    if session:
        with ytdlp_options('https://www.instagram.com/', session) as opts:
            jar = http.cookiejar.MozillaCookieJar(opts['cookiefile'])
            jar.load(ignore_discard=True, ignore_expires=False)
            loader.context._session.cookies.update(jar)
            username = loader.test_login()
            if username:
                loader.context.username = username
    return loader


def resolve_gallery(url, session, offset, page_size):
    from instaloader import Post, Profile
    if platform_key(url) != 'instagram.com':
        raise ValueError('Gallery mode currently supports Instagram posts and profiles.')
    loader = instagram_loader(session)
    match = re.search(r'/(?:p|reel|tv)/([A-Za-z0-9_-]+)', urlsplit(url).path)
    if match:
        posts = [Post.from_shortcode(loader.context, match.group(1))]
        title = 'Instagram gallery'
    else:
        username = urlsplit(url).path.strip('/')
        if not re.fullmatch(r'[A-Za-z0-9_.]{1,30}', username):
            raise ValueError('Paste an Instagram post or profile link.')
        profile = Profile.from_username(loader.context, username)
        posts = list(itertools.islice(profile.get_posts(), offset, offset + page_size))
        title = username + ' · photo archive'
    items = []
    for post in posts:
        nodes = list(post.get_sidecar_nodes()) if post.typename == 'GraphSidecar' else [post]
        for i, node in enumerate(nodes):
            if node.is_video:
                continue
            address = node.display_url if hasattr(node, 'display_url') else node.url
            token = secrets.token_urlsafe(24)
            with LOCK:
                ITEMS[token] = {'source': url, 'kind': 'image', 'imageUrl': address, 'title': post.shortcode + '-' + str(i + 1), 'expires': time.time() + TTL}
            items.append({'id': token, 'url': token, 'kind': 'image', 'ext': 'jpg', 'label': post.shortcode + ' · photo ' + str(i + 1), 'entryId': token, 'entryTitle': post.shortcode, 'quality': 'Original image'})
    if not items and match:
        raise ValueError('No photos found in this post. Try Video mode for Reels.')
    return {'title': title, 'sourceUrl': url, 'items': items, 'collection': True, 'gallery': True, 'galleryEngine': 'instaloader', 'nextOffset': offset + page_size if not match and len(posts) == page_size else None}


def download_gallery_image(item, target):
    # Reuse strict HTTPS/DNS/redirect validation with Instagram CDN hosts.
    from urllib.request import build_opener
    host = (urlsplit(item['imageUrl']).hostname or '').lower()
    domains = ('cdninstagram.com', 'fbcdn.net', 'twimg.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibyteimg.com', 'ibytedtos.com', 'pinimg.com', 'redd.it', 'redditmedia.com', 'staticflickr.com')
    def checked(address):
        import socket, ipaddress
        parsed = urlsplit(address)
        name = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(name == d or name.endswith('.' + d) for d in domains):
            raise ValueError('Unsupported image response host.')
        if any(not ipaddress.ip_address(a[4][0]).is_global for a in socket.getaddrinfo(name, 443, type=socket.SOCK_STREAM)):
            raise ValueError('Unsafe image address.')
    from urllib.request import HTTPRedirectHandler
    class ImageRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            checked(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    checked(item['imageUrl'])
    with build_opener(ImageRedirect()).open(Request(item['imageUrl'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as response, target.open('wb') as output:
        total = 0
        deadline = time.time() + 90
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            if total == 0 and not valid_image_header(chunk, item.get('imageExt', 'jpg')):
                raise ValueError('The platform returned an invalid image.')
            total += len(chunk)
            if total > min(MAX_BYTES, 30000000) or time.time() > deadline:
                raise ValueError('Image download exceeds size or time limit.')
            output.write(chunk)
        if not total:
            raise ValueError('Empty image response.')
    return target


def safe_filename(title):
    return re.sub(r'[\x00-\x1f\x7f\\/*?:"<>|]', '', title).strip().strip('.')[:100] or 'media'


def batch_worker(job_id, items, options):
    folder = ROOT / job_id
    folder.mkdir(exist_ok=True)
    failures = []
    total_bytes = 0
    try:
        with LOCK:
            children = JOBS[job_id].setdefault('children', [secrets.token_urlsafe(24) for _ in items])
        pending = folder / 'media.zip.part'
        with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_STORED) as archive:
            for index, original in enumerate(items):
                chosen = {**options, **original.get('batchOverride', {})}
                if time.time() > JOBS[job_id]['deadline']:
                    raise ValueError('Batch timed out. Download a smaller selection.')
                child = children[index]
                item = dict(original, networkRetries=max(0, min(int(options.get('networkRetries', 2)), 5)),
                            rateLimitKiB=max(0, min(int(options.get('rateLimitKiB', 0)), 1000000)),
                            muted=chosen.get('videoMode') == 'muted', videoFormat=chosen.get('videoFormat', 'mp4'),
                            audioFormat=chosen.get('audioFormat', 'mp3'), fragments=max(1, min(int(options.get('fragments', 1)), 4)))
                with LOCK:
                    cached = JOBS.get(child)
                    ready = cached and cached['status'] == 'ready' and Path(cached.get('path', '')).is_file()
                    if not ready:
                        JOBS[child] = {'status': 'processing', 'kind': item['kind'], 'expires': time.time() + TTL,
                                       'deadline': JOBS[job_id]['deadline'], 'item': item, 'parent': job_id}
                if not ready:
                    worker(child, item)
                result = JOBS[child]
                if result['status'] == 'ready':
                    path = Path(result['path'])
                    total_bytes += path.stat().st_size
                    if total_bytes > MAX_BYTES:
                        raise ValueError('The batch exceeds the configured archive size limit.')
                    pattern = str(options.get('filenamePattern', '{title}'))[:120]
                    name = pattern.replace('{title}', item['title']).replace('{index}', str(index + 1)).replace('{author}', item.get('author', '')).replace('{platform}', platform_key(item['source'])).replace('{date}', time.strftime('%Y-%m-%d'))
                    archive.write(path, f'{index + 1:03d}-' + safe_filename(name) + '.' + result['ext'])
                else:
                    failures.append({'item': index + 1, 'title': item['title'], 'error': result.get('error')})
                with LOCK:
                    JOBS[job_id]['completed'] = index + 1
            if failures:
                archive.writestr('download-errors.json', json.dumps(failures, indent=2))
        if pending.stat().st_size > MAX_BYTES:
            raise ValueError('The archive exceeds the configured size limit.')
        if len(failures) == len(items):
            raise ValueError('None of the selected items could be downloaded. Retry after fixing platform access.')
        pending.replace(folder / 'media.zip')
        with LOCK:
            expires = time.time() + TTL
            JOBS[job_id].update(status='ready', path=str(folder / 'media.zip'), ext='zip', expires=expires, failedCount=len(failures))
            for child in children:
                JOBS[child]['expires'] = expires
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update(status='error', error=public_error(exc) if not isinstance(exc, ValueError) else str(exc), expires=time.time() + TTL)
        (folder / 'media.zip.part').unlink(missing_ok=True)


def start_batch(tokens, options=None):
    options = options or {}
    if not isinstance(options, dict):
        raise ValueError('Invalid download options.')
    if not isinstance(tokens, list) or not 1 <= len(tokens) <= 100 or any(not isinstance(t, str) for t in tokens):
        raise ValueError('Select 1–100 media items per archive.')
    if options.get('videoFormat', 'mp4') not in ('mp4', 'mkv'):
        raise ValueError('Unsupported video container.')
    if options.get('audioFormat', 'mp3') not in AUDIO_FORMATS:
        raise ValueError('Unsupported audio format.')
    with LOCK:
        items = [ITEMS.get(t) for t in dict.fromkeys(tokens)]
        if any(not item or item['expires'] < time.time() for item in items):
            raise ValueError('A selection expired. Check the link again.')
        overrides = options.get('itemOverrides') or {}
        if not isinstance(overrides, dict):
            raise ValueError('Invalid per-item settings.')
        configured = []
        for token, original in zip(dict.fromkeys(tokens), items):
            override = overrides.get(token) or {}
            if not isinstance(override, dict):
                raise ValueError('Invalid per-item settings.')
            if override.get('audioFormat', 'mp3') not in AUDIO_FORMATS or override.get('videoFormat', 'mp4') not in ('mp4', 'mkv') or override.get('videoMode', 'combined') not in ('combined', 'muted'):
                raise ValueError('Invalid per-item output format.')
            configured.append(dict(original, batchOverride={key: value for key, value in override.items() if key in ('audioFormat', 'videoFormat', 'videoMode')}))
        items = configured
        if engine_manager.info()['status'] in ('updating', 'restarting'):
            raise ValueError('Engines are updating. Try again after the restart.')
        if sum(j['status'] == 'processing' for j in JOBS.values()) >= 4:
            raise ValueError('The downloader is busy. Try again shortly.')
        job = secrets.token_urlsafe(24)
        JOBS[job] = {'status': 'processing', 'kind': 'archive', 'title': 'Fetchly archive', 'expires': time.time() + TTL, 'deadline': time.time() + 900, 'completed': 0, 'total': len(items), 'batchItems': [dict(item) for item in items], 'options': options}
    POOL.submit(batch_worker, job, items, options)
    return {'job': job, 'status': 'processing'}


def valid_image_header(chunk, ext):
    return {'jpg': chunk.startswith(b'\xff\xd8\xff'), 'png': chunk.startswith(b'\x89PNG\r\n\x1a\n'),
            'gif': chunk.startswith((b'GIF87a', b'GIF89a')), 'webp': chunk.startswith(b'RIFF') and chunk[8:12] == b'WEBP'}.get(ext, False)


def resolve_gallery_engine(url, session, offset, count):
    from gallery_adapter import extract_images
    if platform_key(url) not in ('instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'pin.it', 'reddit.com', 'redd.it', 'flickr.com'):
        raise ValueError('Gallery mode supports Instagram, X, TikTok photos, Pinterest, Reddit, and Flickr.')
    with ytdlp_options(url, session) as opts:
        images, more = extract_images(url, offset, count, opts.get('cookiefile'))
    items = []
    for index, image in enumerate(images):
        token = secrets.token_urlsafe(24)
        with LOCK:
            ITEMS[token] = {'source': url, 'kind': 'image', 'imageUrl': image['url'], 'imageExt': image['ext'],
                            'title': image['title'], 'expires': time.time() + TTL}
        items.append({'id': token, 'url': token, 'kind': 'image', 'ext': image['ext'], 'label': image['title'],
                      'entryId': str(offset + index), 'entryTitle': image['title'], 'quality': 'Original image', 'sourceUrl': url})
    if not items and not more:
        raise ValueError('No supported images found. The post may contain only videos or require login.')
    return {'title': 'Photo collection', 'sourceUrl': url, 'items': items, 'collection': True, 'gallery': True, 'galleryEngine': 'gallery-dl',
            'nextOffset': offset + count if more else None}


def retry_job(token, session=None):
    if not isinstance(token, str):
        raise ValueError('Invalid job token.')
    with LOCK:
        job = JOBS.get(token)
        if not job or job['expires'] < time.time():
            raise ValueError('Download expired. Check the original link again.')
        if engine_manager.info()['status'] in ('updating', 'restarting'):
            raise ValueError('Engines are updating. Retry after the restart.')
        if session:
            if not isinstance(session, str) or session not in SESSIONS or SESSIONS[session]['expires'] < time.time():
                raise ValueError('Cookie session expired. Import cookies again.')
            if job.get('item'):
                job['item']['session'] = session
            for item in job.get('batchItems', []):
                item['session'] = session
        if job['status'] == 'processing' or (job['status'] == 'ready' and not job.get('failedCount')):
            return {'job': token, 'status': job['status']}
        if sum(j['status'] == 'processing' for j in JOBS.values()) >= 4:
            raise ValueError('The downloader is busy. Retry shortly.')
        job.update(status='processing', deadline=time.time() + 900, expires=time.time() + TTL)
        job.pop('error', None)
        item = job.get('item')
        batch_items = job.get('batchItems')
        options = job.get('options', {})
    if item:
        POOL.submit(worker, token, dict(item))
    elif batch_items:
        POOL.submit(batch_worker, token, batch_items, options)
    else:
        with LOCK:
            job.update(status='error', error='This job cannot be retried. Check the link again.')
        raise ValueError('This job cannot be retried. Check the link again.')
    return {'job': token, 'status': 'processing'}


def update_engines(admin):
    key = os.environ.get('FETCHLY_ADMIN_KEY', '')
    if len(key) < 32 or not isinstance(admin, str) or not hmac.compare_digest(admin, key):
        raise ValueError('Engine updates require the server admin key.')
    # Hold resolver capacity until the process restarts, so extraction cannot race imports.
    acquired = 0
    for _ in range(2):
        if RESOLVERS.acquire(blocking=False):
            acquired += 1
        else:
            for _ in range(acquired):
                RESOLVERS.release()
            raise ValueError('An extraction is active. Retry the update after it finishes.')
    try:
        with LOCK:
            if any(job['status'] == 'processing' for job in JOBS.values()):
                raise ValueError('Downloads are active. Finish them before updating engines.')
            def restart():
                shutil.rmtree(ROOT, ignore_errors=True)
                os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])
            result = engine_manager.start(restart)
    except Exception:
        for _ in range(acquired):
            RESOLVERS.release()
        raise
    def release_on_failure():
        while engine_manager.info()['status'] in ('updating', 'restarting'):
            time.sleep(0.5)
        for _ in range(acquired):
            RESOLVERS.release()
    threading.Thread(target=release_on_failure, daemon=True).start()
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log URLs, cookies, or bearer tokens.

    def reply(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(payload)

    def authorized(self):
        if not KEY or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + KEY):
            self.reply(401, {'error': 'Unauthorized'})
            return False
        return True

    def do_POST(self):
        if not self.authorized():
            return
        body = None
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= (1048576 if self.path == '/cookies' else 32768):
                raise ValueError('Invalid request size.')
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Expected a JSON object.')
            if body.get('options') is not None and not isinstance(body['options'], dict):
                raise ValueError('Invalid download options.')
            if self.path == '/resolve':
                if not RESOLVERS.acquire(blocking=False):
                    return self.reply(429, {'error': 'The downloader is busy. Try again shortly.'})
                try:
                    result = resolve(validate_url(body.get('url')), body.get('options'))
                finally:
                    RESOLVERS.release()
            elif self.path == '/cookies':
                result = import_cookies(body.get('cookies'))
            elif self.path == '/forget-cookies':
                with LOCK:
                    SESSIONS.pop(body.get('session'), None) if isinstance(body.get('session'), str) else None
                result = {'ok': True}
            elif self.path == '/retry':
                result = retry_job(body.get('job'), body.get('session'))
            elif self.path == '/engines/update':
                result = update_engines(self.headers.get('X-Fetchly-Admin', ''))
            elif self.path == '/prepare':
                result = start_batch(body['tokens'], body.get('options')) if 'tokens' in body else start_job(body.get('token'), body.get('options'))
            else:
                return self.reply(404, {'error': 'Unknown endpoint'})
            self.reply(200, result)
        except (ValueError, TypeError) as exc:
            if self.path == '/resolve' and isinstance(body, dict) and isinstance(body.get('url'), str):
                try:
                    source = validate_url(body['url'])
                    if platform_key(source) == 'tiktok.com':
                        try:
                            return self.reply(200, tiktok_oembed_preview(source))
                        except Exception:
                            pass
                except (ValueError, TypeError):
                    pass
            self.reply(422, {'error': str(exc)})
        except Exception as exc:
            if self.path == '/resolve' and isinstance(body, dict) and isinstance(body.get('url'), str):
                try:
                    source = validate_url(body['url'])
                    kind = error_kind(exc)
                    logging.warning('resolve failed: platform=%s category=%s', platform_key(source), kind)
                except (ValueError, TypeError):
                    pass
            else:
                logging.warning('backend request failed: endpoint=%s category=%s', self.path, error_kind(exc))
            if self.path == '/resolve' and isinstance(body, dict) and isinstance(body.get('url'), str):
                try:
                    source = validate_url(body['url'])
                    if platform_key(source) == 'tiktok.com' and error_kind(exc) != 'rate_limited':
                        try:
                            return self.reply(200, tiktok_oembed_preview(source))
                        except Exception as preview_error:
                            logging.info('TikTok preview fallback unavailable: category=%s', error_kind(preview_error))
                except (ValueError, TypeError):
                    pass
            self.reply(502, {'error': public_error(exc)})

    def do_GET(self):
        if urlsplit(self.path).path == '/healthz':
            ok = bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))
            return self.reply(200 if ok else 503, {'ok': ok})
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        if path == '/engines':
            return self.reply(200, engine_manager.info())
        if path == '/health':
            return self.reply(200, {'ok': bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))})
        endpoint, _, token = path.lstrip('/').partition('/')
        with LOCK:
            job = dict(JOBS.get(token, {}))
        if not job or job['expires'] < time.time():
            return self.reply(404, {'error': 'Download expired. Resolve the link again.'})
        if endpoint == 'status':
            return self.reply(200, {k: job[k] for k in ('status', 'error', 'ext', 'completed', 'total', 'expires', 'failedCount') if k in job})
        if endpoint != 'file' or job['status'] != 'ready':
            return self.reply(409, {'error': 'The download is not ready.'})
        try:
            with open(job['path'], 'rb') as media:
                size = os.fstat(media.fileno()).st_size
                start, end = 0, size - 1
                requested = self.headers.get('Range')
                if requested:
                    match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested) if len(requested) <= 128 else None
                    if match and (match[1] or match[2]):
                        if match[1]:
                            start = int(match[1])
                            end = min(int(match[2]), size - 1) if match[2] else size - 1
                        else:
                            start = max(0, size - int(match[2]))
                    if not match or not (match[1] or match[2]) or start > end or start >= size or (not match[1] and int(match[2]) == 0):
                        self.send_response(416)
                        self.send_header('Content-Range', f'bytes */{size}')
                        self.send_header('Content-Length', '0')
                        self.end_headers()
                        return
                self.send_response(206 if requested else 200)
                self.send_header('Content-Type', MIME[job.get('ext', 'mp4' if job['kind'] == 'video' else 'mp3')])
                self.send_header('Accept-Ranges', 'bytes')
                if requested:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(end - start + 1))
                self.end_headers()
                if self.command != 'HEAD':
                    media.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        chunk = media.read(min(remaining, 256 * 1024))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass


    def do_HEAD(self):
        self.do_GET()


if __name__ == '__main__':
    if len(KEY) < 32:
        raise SystemExit('Set MEDIA_BACKEND_KEY to a random secret of at least 32 characters.')
    threading.Thread(target=cleanup, daemon=True).start()
    try:
        ThreadingHTTPServer((os.environ.get('MEDIA_BIND', '127.0.0.1'), int(os.environ.get('PORT', os.environ.get('MEDIA_BIND_PORT', '8787')))), Handler).serve_forever()
    finally:
        shutil.rmtree(ROOT, ignore_errors=True)
