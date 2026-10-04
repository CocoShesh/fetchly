"""Bounded public TikTok page fallback; no shared account cookie jar."""
import ipaddress
import json
import re
import socket
import time
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'
CDNS = ('tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'byteoversea.com', 'ibytedtos.com', 'ibyteimg.com', 'muscdn.com', 'bytecdn.cn')


def safe_url(url, media=False):
    p = urlsplit(url)
    host = (p.hostname or '').lower()
    domains = CDNS if media else ('tiktok.com',)
    if p.scheme != 'https' or p.username or p.password or p.port not in (None, 443) or not any(host == d or host.endswith('.' + d) for d in domains):
        raise ValueError('Unsupported TikTok response host.')
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Unsafe TikTok response address.')
    return url


class Redirects(HTTPRedirectHandler):
    def __init__(self, media):
        self.media = media
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl, self.media)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request(url, media=False, headers=None):
    safe_url(url, media)
    return build_opener(Redirects(media)).open(Request(url, headers={
        'User-Agent': UA, 'Referer': 'https://www.tiktok.com/', **(headers or {})}), timeout=20)


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.parts = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.active = True
            self.parts = []
    def handle_data(self, data):
        if self.active:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.scripts.append(''.join(self.parts))
            self.active = False


def parse_page(html, video_id):
    parser = Scripts()
    parser.feed(html)
    for script in parser.scripts:
        try:
            tree = json.loads(script)
        except (ValueError, TypeError):
            continue
        stack = [tree]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                if str(node.get('id')) == video_id and isinstance(node.get('video'), dict):
                    return node
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    raise ValueError('TikTok page did not expose the requested video.')


def addresses(value):
    if isinstance(value, str):
        return [value] if value.startswith('https://') else []
    if isinstance(value, dict):
        return addresses(value.get('UrlList') or value.get('urlList') or [])
    if isinstance(value, list):
        return [url for v in value for url in addresses(v)]
    return []


def candidates(post):
    video = post['video']
    choices = []
    for variant in video.get('bitrateInfo') or []:
        addr = variant.get('PlayAddr') or variant.get('playAddr') or {}
        for url in addresses(addr):
            choices.append((int(addr.get('Height') or video.get('height') or 0), int(variant.get('Bitrate') or 0), url))
    for key in ('playAddr', 'downloadAddr'):
        for url in addresses(video.get(key)):
            choices.append((int(video.get('height') or 0), 0, url))
    result = []
    seen = set()
    for height, bitrate, url in sorted(choices, reverse=True):
        if url not in seen:
            seen.add(url)
            result.append((height, url))
    return result[:6]


def extract(url):
    match = re.search(r'/video/(\d+)', urlsplit(url).path)
    with request(url) as response:
        final_url = response.geturl()
        data = response.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024:
        raise ValueError('TikTok page exceeds size limit.')
    match = match or re.search(r'/video/(\d+)', urlsplit(final_url).path)
    if not match:
        raise ValueError('Use a TikTok video post link.')
    post = parse_page(data.decode('utf-8', 'replace'), match.group(1))
    options = candidates(post)
    if not options:
        raise ValueError('TikTok page contains no downloadable source.')
    # Do not offer formats merely because the page contains a signed address.
    for height, address in options:
        try:
            with request(address, True, {'Range': 'bytes=0-4095'}) as response:
                head = response.read(4096)
            if b'ftyp' in head[:64]:
                return post, height
        except (OSError, ValueError):
            continue
    raise ValueError('TikTok refused the video file request (HTTP 403 or unavailable source).')


def download(url, target, max_bytes, deadline):
    post, _ = extract(url)
    for _, address in candidates(post):
        try:
            total = 0
            with request(address, True) as response, target.open('wb') as output:
                length = response.headers.get('Content-Length')
                if length and int(length) > max_bytes:
                    raise ValueError('Download exceeds size limit.')
                while True:
                    if time.time() > deadline:
                        raise ValueError('Download timed out.')
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    if total == 0 and b'ftyp' not in chunk[:64]:
                        raise ValueError('TikTok returned a non-video response.')
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError('Download exceeds size limit.')
                    output.write(chunk)
            if total:
                return target
        except OSError:
            target.unlink(missing_ok=True)
            continue
    raise ValueError('TikTok refused the video file request (HTTP 403 or unavailable source).')
