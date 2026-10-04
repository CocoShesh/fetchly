"""Bounded isolated gallery-dl metadata extraction; private cookies never persist."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def extract_images(url, offset=0, count=20, cookiefile=None):
    with tempfile.TemporaryDirectory(prefix='fetchly-gallery-') as folder:
        output = Path(folder) / 'metadata.jsonl'
        cmd = [sys.executable, str(Path(__file__).with_name('gallery_runner.py')), url, str(offset), str(count)]
        if cookiefile:
            cmd.append(cookiefile)
        with output.open('wb') as stream:
            process = subprocess.Popen(cmd, stdout=stream, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL,
                                       env={**os.environ, 'PYTHONPATH': os.pathsep.join(sys.path)})
            try:
                deadline = time.monotonic() + 100
                while process.poll() is None:
                    if time.monotonic() > deadline or output.stat().st_size > 5 * 1024 * 1024:
                        raise ValueError('Gallery extraction exceeded its time or metadata size limit.')
                    time.sleep(0.15)
                if process.returncode or output.stat().st_size > 5 * 1024 * 1024:
                    raise ValueError('Gallery extraction failed. The site may require login or an engine update.')
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
        try:
            rows = [json.loads(line) for line in output.read_text().splitlines() if line]
        except ValueError:
            raise ValueError('The gallery engine returned invalid metadata.') from None
    return rows[:count], len(rows) > count
