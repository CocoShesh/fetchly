"""Isolated gallery-dl collector with one global image-page budget across profiles."""
import json
import sys
from urllib.parse import urlsplit
from gallery_dl import config, exception, extractor, job

ALLOWED = {'instagram', 'twitter', 'tiktok', 'pinterest', 'reddit', 'flickr'}
SOURCE_HOSTS = ('instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com', 'pin.it', 'reddit.com', 'redd.it', 'flickr.com')


def main():
    url, offset, count = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    cookiefile = sys.argv[4] if len(sys.argv) > 4 else None
    config.set(('cache',), 'file', None)
    config.set(('extractor',), 'timeout', 15)
    config.set(('extractor',), 'retries', 1)
    if cookiefile:
        config.set(('extractor',), 'cookies', cookiefile)
    state = {'seen': set(), 'index': 0, 'items': 0, 'queues': {url}}

    class Collector(job.DataJob):
        def __init__(self, source, parent=None):
            super().__init__(source, parent, file=None, resolve=False)

        def handle_directory(self, metadata):
            pass

        def handle_url(self, address, metadata):
            if state['items'] >= count + 1:
                raise exception.StopExtraction()
            extension = str(metadata.get('extension', '')).lower()
            if extension not in ('jpg', 'jpeg', 'png', 'webp', 'gif') or not isinstance(address, str) or not address.startswith('https://') or address in state['seen']:
                return
            state['seen'].add(address)
            state['index'] += 1
            if state['index'] <= offset:
                return
            row = {'url': address, 'ext': 'jpg' if extension == 'jpeg' else extension,
                   'title': str(metadata.get('filename') or metadata.get('id') or 'photo')[:100]}
            print(json.dumps(row), flush=True)
            state['items'] += 1

        def handle_queue(self, address, metadata):
            if state['items'] >= count + 1:
                raise exception.StopExtraction()
            if not isinstance(address, str):
                return
            parsed = urlsplit(address)
            host = (parsed.hostname or '').lower()
            if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(host == domain or host.endswith('.' + domain) for domain in SOURCE_HOSTS):
                return
            if address in state['queues'] or len(state['queues']) >= 1000:
                return
            state['queues'].add(address)
            child = extractor.find(address)
            if child and child.category in ALLOWED:
                Collector(child, self).run()

    root = Collector(url)
    if root.extractor.category not in ALLOWED:
        return 1
    root.run()
    return 1 if root.exception and not state['items'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
