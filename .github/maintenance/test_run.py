"""Safety checks for the scheduled publisher; uses disposable directories and mocked git."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('run.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)

class PublisherSafety(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        folder = self.root / '.github/maintenance'
        folder.mkdir(parents=True)
        source = self.root / 'package.json'
        source.write_text('{"name":"fixture"}')
        today = dt.datetime.now(ZoneInfo('Asia/Manila')).date().isoformat()
        self.task = {'id':'fixture', 'due':today, 'title':'Document fixture setup',
                     'files':{'CONTRIBUTING.md':'Fixture setup guide.\n'},
                     'source_hashes':{'package.json':hashlib.sha256(source.read_bytes()).hexdigest()}}
        self.plan = {'start':today, 'end':today, 'tasks':[self.task]}
        (folder/'plan.json').write_text(json.dumps(self.plan))
        self.calls = []
        def fake_git(*args):
            self.calls.append(args)
            return 'fixture-sha' if args[0]=='rev-parse' else ''
        self.fake_git = fake_git

    def run_main(self, apply=True):
        with patch.object(publisher,'ROOT',self.root), patch.object(publisher,'git',side_effect=self.fake_git), \
             patch('sys.argv',['run.py']+(['--apply'] if apply else [])), \
             patch.dict(os.environ,{'DEFAULT_BRANCH':'main','GITHUB_STEP_SUMMARY':''}):
            publisher.main()

    def test_date_window_and_receipts(self):
        self.assertIsNone(publisher.choose(self.plan,{},'2000-01-01'))
        self.assertIsNone(publisher.choose(self.plan,{},'2999-01-01'))
        self.assertIsNone(publisher.choose(self.plan,{'fixture':{}},self.plan['start']))
        self.assertEqual(publisher.choose(self.plan,{},self.plan['start']),self.task)

    def test_dry_run_writes_nothing(self):
        self.run_main(apply=False)
        self.assertFalse((self.root/'CONTRIBUTING.md').exists())
        self.assertFalse(any(c[0]=='push' for c in self.calls))

    def test_second_run_is_idempotent(self):
        self.run_main(); self.run_main()
        self.assertEqual(sum(c[0]=='push' for c in self.calls),1)
        self.assertEqual((self.root/'CONTRIBUTING.md').read_text(),'Fixture setup guide.\n')
        self.assertTrue(all('--force' not in c for c in self.calls))

    def test_existing_destination_is_preserved(self):
        (self.root/'CONTRIBUTING.md').write_text('Existing contributor work')
        self.run_main()
        self.assertEqual((self.root/'CONTRIBUTING.md').read_text(),'Existing contributor work')
        self.assertFalse(any(c[0]=='push' for c in self.calls))

    def test_changed_source_prevents_publication(self):
        (self.root/'package.json').write_text('{"name":"changed"}')
        self.run_main()
        self.assertFalse((self.root/'CONTRIBUTING.md').exists())
        self.assertFalse(any(c[0]=='push' for c in self.calls))

    def test_path_escape_rejected(self):
        self.task['files']={'../escape.md':'Unsafe'}
        (self.root/'.github/maintenance/plan.json').write_text(json.dumps(self.plan))
        with self.assertRaisesRegex(RuntimeError,'Unsafe'):
            self.run_main()

    def test_dirty_checkout_rejected(self):
        self.fake_git=lambda *args: ' M package.json' if args[0]=='status' else ''
        with self.assertRaisesRegex(RuntimeError,'not clean'):
            self.run_main()

if __name__=='__main__':
    unittest.main()
