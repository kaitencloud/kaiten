import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which('node') and os.name == 'posix', 'Node/POSIX fixture')
class StackRunnerTests(unittest.TestCase):
    def fixture(self, directory, mode):
        root = Path(directory)
        (root / 'app/scripts').mkdir(parents=True)
        for name in ('test-stack.mjs', 'stack-process.mjs'):
            shutil.copy2(ROOT / 'app/scripts' / name, root / 'app/scripts' / name)
        (root / '.env.example').write_text('KAITEN_DATABASE_USER=fixture\nKAITEN_DATABASE=fixture\n')
        (root / 'compose.yml').write_text('services: {}\n')
        binary = root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        log = root / 'commands.jsonl'
        body = '''import json,os,sys,time
args=sys.argv[1:]
with open(LOG,'a') as stream:
 stream.write(json.dumps({'args':args,'provider_present':'FIXTURE_PROVIDER_TOKEN' in os.environ,'dev_dir':os.environ.get('KAITEN_DEV_DIR')})+'\\n')
if 'up' in args:
 if MODE=='signal': time.sleep(20)
 print('Authorization: Bearer planted-secret')
 sys.exit(17)
if 'down' in args: sys.exit(19 if MODE=='cleanup-fail' else 0)
sys.exit(0)
'''
        docker.write_text('#!' + shutil.which('python3') + '\nLOG=' + repr(str(log)) + '\nMODE=' + repr(mode) + '\n' + body)
        docker.chmod(0o700)
        return root, log, dict(os.environ, PATH=str(binary) + os.pathsep + os.environ['PATH'], FIXTURE_PROVIDER_TOKEN='planted-provider-secret')

    def verify(self, root, log, code, output):
        self.assertNotEqual(code, 0)
        self.assertNotIn(b'planted-secret', output)
        self.assertNotIn(b'planted-provider-secret', output)
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertFalse(any(call['provider_present'] for call in calls))
        down = next(call for call in calls if 'down' in call['args'])
        project = down['args'][down['args'].index('--project-name') + 1]
        self.assertTrue(project.startswith('kaiten-test-'))
        self.assertFalse(Path(down['dev_dir']).exists())
        self.assertFalse(any('prune' in call['args'] for call in calls))
        report = json.loads(next((root / '.audit').glob('stack-*/manifest.json')).read_text())
        self.assertEqual(report['status'], 'failed')
        self.assertTrue(any(item['id'] == 'stack:teardown' for item in report['commands']))
        self.assertNotIn('planted-secret', json.dumps(report))
        return report

    def test_entry_failure_private_artifact_and_failed_teardown(self):
        with tempfile.TemporaryDirectory() as directory:
            root, log, env = self.fixture(directory, 'cleanup-fail')
            result = subprocess.run(['node', str(root / 'app/scripts/test-stack.mjs')], env=env, capture_output=True, timeout=8)
            report = self.verify(root, log, result.returncode, result.stdout + result.stderr)
            self.assertEqual(next(item for item in report['commands'] if item['id'] == 'stack:teardown')['status'], 'failed')

    def test_real_entry_signal_retains_failure_and_owned_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root, log, env = self.fixture(directory, 'signal')
            parent = subprocess.Popen(['node', str(root / 'app/scripts/test-stack.mjs')], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not log.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(log.exists())
                parent.send_signal(signal.SIGTERM)
                output, errors = parent.communicate(timeout=8)
                self.assertEqual(parent.returncode, 143)
                self.verify(root, log, parent.returncode, output + errors)
            finally:
                if parent.poll() is None:
                    parent.kill()
                    parent.wait()


if __name__ == '__main__':
    unittest.main()
