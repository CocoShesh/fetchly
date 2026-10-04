import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('server', Path(__file__).parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class BackendTests(unittest.TestCase):
    def test_url_validation(self):
        for url in ['https://x.com/user/status/123', 'youtu.be/123', 'https://vm.tiktok.com/123', 'https://www.instagram.com/reel/a/']:
            self.assertTrue(server.validate_url(url).startswith('https://'))
        for url in ['https://youtube.com.evil.com/a', 'https://evil.com/?u=https://x.com',
                    'http://x.com/a', 'https://x.com@127.0.0.1/a', 'https://x.com:8787/a',
                    'https://localhost/', None, 10]:
            with self.assertRaises((ValueError, TypeError)):
                server.validate_url(url)

    def test_platform_metadata(self):
        # Fixtures exercise the integration adapter, not live platform extraction.
        for host in ['youtube.com', 'tiktok.com', 'instagram.com', 'facebook.com', 'x.com']:
            info = {'title': host, 'webpage_url': f'https://{host}/post/1',
                    'formats': [{'vcodec': 'h264', 'acodec': 'aac'}]}
            with patch('yt_dlp.YoutubeDL') as ydl:
                ydl.return_value.__enter__.return_value.extract_info.return_value = info
                result = server.resolve(info['webpage_url'])
            self.assertEqual([x['ext'] for x in result['items']], ['mp4', 'mp3'])
            for item in result['items']:
                self.assertEqual(len(item['url']), 32)
                self.assertFalse(item['url'].startswith('http'))

    def test_no_fake_photo_download(self):
        with patch('yt_dlp.YoutubeDL') as ydl:
            ydl.return_value.__enter__.return_value.extract_info.return_value = {'title': 'photo', 'formats': []}
            with self.assertRaisesRegex(ValueError, 'No downloadable'):
                server.resolve('https://instagram.com/p/1')

    def test_expired_token(self):
        server.ITEMS['expired'] = {'expires': 0}
        with self.assertRaisesRegex(ValueError, 'expired'):
            server.start_job('expired')

    def test_ffmpeg_produces_video_with_audio_and_mp3(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source.mkv'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                            'testsrc2=size=160x120:rate=10', '-f', 'lavfi', '-i',
                            'sine=frequency=440', '-t', '0.5', '-c:v', 'libx264',
                            '-c:a', 'aac', str(source)], check=True)
            for kind, ext in [('video', 'mp4'), ('audio', 'mp3')]:
                target = root / ('media.' + ext)
                server.normalize_media(source, target, kind)
                result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                         'stream=codec_type', '-of', 'json', str(target)],
                                        check=True, capture_output=True)
                streams = [s['codec_type'] for s in json.loads(result.stdout)['streams']]
                self.assertIn(kind, streams)
                if kind == 'video':
                    self.assertIn('audio', streams)
                    self.assertEqual(target.read_bytes()[4:8], b'ftyp')

    def test_json_is_rejected_not_renamed(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'error.json'
            source.write_text('{"error":"platform blocked"}')
            with self.assertRaises(subprocess.CalledProcessError):
                server.normalize_media(source, Path(temp) / 'media.mp4', 'video')


if __name__ == '__main__':
    unittest.main()
