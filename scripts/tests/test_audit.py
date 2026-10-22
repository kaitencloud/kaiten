import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import audit
import diagnose


class AuditTests(unittest.TestCase):
    def test_failure_and_blocker_are_not_passes(self):
        inspect = lambda _: {'status': 'passed', 'checks': []}
        with patch.object(audit, 'identity', return_value={'revision': 'a' * 40, 'dirty': True}):
            for code, error, expected in [(17, None, 'failed'), (None, 'unavailable', 'blocked'), (0, None, 'passed')]:
                report = audit.check('unit', ['frontend'], run=lambda *a, **kw: (code, 'Authorization: secret', error), inspect=inspect)
                self.assertEqual(report['status'], expected)
                self.assertNotIn('Authorization', json.dumps(report))
                self.assertEqual(report['commands'][0]['exit_code'], code)

    def test_signature_stable_and_no_git_narrowing(self):
        a = audit.record('fixture', 'failed', 'command_failed')
        b = dict(a, started_at='tomorrow', exit_code=9, duration_seconds=12)
        self.assertEqual(audit.signature('static', [a]), audit.signature('static', [b]))
        self.assertNotEqual(audit.signature('static', [a]), audit.signature('unit', [a]))
        names = [g[0] for g in audit.gates('static', audit.AREAS)]
        self.assertIn('api/cmd/schema-docs:vet', names)
        self.assertIn('frontend:fmt:check', names)
        self.assertIn('generator:owned-build-drift', names)

    def test_unauthorized_runtime_security_no_execution(self):
        with patch.object(audit, 'identity', return_value={}):
            for profile, areas in [('runtime', audit.AREAS), ('security', audit.AREAS), ('unit', ['backend']), ('unit', ['theme']), ('unit', ['charts'])]:
                report = audit.check(profile, areas, run=lambda *a, **kw: self.fail('must not run'))
                self.assertEqual(report['status'], 'blocked')

    def test_preflight_blocks_product_launch(self):
        with patch.object(audit, 'identity', return_value={}):
            report = audit.check('static', ['frontend'], run=lambda *a, **kw: self.fail('gate must not launch'),
                                 inspect=lambda _: {'status': 'blocked', 'checks': []})
            self.assertEqual(report['status'], 'blocked')
            report = audit.check('static', ['backend'], run=lambda *a, **kw: self.fail('gate must not launch'),
                                 inspect=lambda _: {'status': 'blocked', 'checks': []})
            self.assertEqual(report['status'], 'blocked')
            self.assertFalse(any('lint:api:check' in str(g[1]) for g in audit.gates('static', ['backend'])))

    def test_all_profile_area_pairs_have_explicit_coverage(self):
        for profile in ('static', 'unit', 'runtime', 'security'):
            for area in audit.AREAS:
                self.assertTrue(audit.gates(profile, [area]), (profile, area))

    def test_mixed_area_unsupported_coverage_blocks(self):
        inspect = lambda _: {'status': 'passed', 'checks': []}
        with patch.object(audit, 'identity', return_value={}):
            for areas in (['frontend', 'theme'], ['frontend', 'charts']):
                report = audit.check('unit', areas, run=lambda *a, **kw: (0, '', None), inspect=inspect)
                self.assertEqual(report['status'], 'blocked')
                self.assertTrue(any(c['id'] == 'coverage:unit:' + areas[1]
                                    and c['status'] == 'blocked' for c in report['commands']))

    def test_build_context_private_exclusions_preserve_sources(self):
        # Fixture subset: literal paths, basename globs and directory descendants.
        import fnmatch
        patterns = [line.strip() for line in (ROOT / '.dockerignore').read_text().splitlines()
                    if line.strip() and not line.startswith('#')]
        def excluded(name):
            answer = False
            for pattern in patterns:
                negate = pattern.startswith('!')
                target = pattern.lstrip('!').rstrip('/')
                if fnmatch.fnmatchcase(name, target) or name.startswith(target + '/'):
                    answer = not negate
            return answer
        private = ['.env', '.env.local', 'dev/tokens.json', 'dev/platform-token',
                   '.audit/run/manifest.json', 'api/config.yaml', 'api/config.json']
        required = ['.env.example', 'api/go.mod', 'api/go.sum', 'api/cmd/server/main.go',
                    'api/internal/modules/demo/db/migrations/001.sql']
        for name in private:
            self.assertTrue(excluded(name), name)
        for name in required:
            self.assertFalse(excluded(name), name)

    def test_old_node_blocks_tooling_before_python_fixtures(self):
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return 0, 'v18.20.0', None
        with patch.object(audit, 'identity', return_value={}):
            report = audit.check('unit', ['tooling'], run=run)
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(calls, [['node', '--version']])

    def test_private_unique_evidence_and_symlink_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for _ in range(2):
                report = audit.manifest('static', [], audit.now(), repo={'revision': None})
                audit.save(report, root)
                file = root / report['artifacts'][0]
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)
                self.assertEqual(file.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(len(list((root / '.audit').iterdir())), 2)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.audit').symlink_to(root)
            with self.assertRaises(ValueError):
                audit.save({}, root)

    def test_timeout_output_limit_and_secret_discard(self):
        for body, expected in [('import time; time.sleep(10)', 'timeout'), ('print("x"*200000)', 'output_limit')]:
            started = time.monotonic()
            code, output, error = audit.execute([sys.executable, '-c', body], timeout=.15 if expected == 'timeout' else 3)
            self.assertIsNone(code)
            self.assertEqual(output, '')
            self.assertEqual(error, expected)
            self.assertLess(time.monotonic() - started, 4)
        code, output, error = audit.execute([sys.executable, '-c', 'import sys; sys.stderr.write("Bearer planted-secret"); print("ok")'])
        self.assertEqual((code, output.strip(), error), (0, 'ok', None))

    def test_identity_allowlist(self):
        for secret in ('token=abc', 'Authorization: Bearer abc', 'postgres://user:password@host/db', '.env'):
            report = audit.identity(lambda *args, **kw: (0, secret, None))
            self.assertIsNone(report['revision'])
            self.assertNotIn(secret, json.dumps(report))

    @unittest.skipUnless(os.name == 'posix', 'POSIX fixture')
    def test_signal_child_group_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            pidfile = Path(directory) / 'pid'
            script = 'import os,time; open(' + repr(str(pidfile)) + ',"w").write(str(os.getpid())); time.sleep(20)'
            driver = 'import audit,signal,sys; signal.signal(signal.SIGTERM,lambda *a: (_ for _ in ()).throw(KeyboardInterrupt())); print(audit.execute([sys.executable,"-c",' + repr(script) + ']))'
            parent = subprocess.Popen([sys.executable, '-c', driver], env=dict(os.environ, PYTHONPATH=str(ROOT / 'scripts')), stdout=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not pidfile.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(pidfile.exists())
                parent.send_signal(signal.SIGTERM)
                output, _ = parent.communicate(timeout=5)
                self.assertIn(b'interrupted', output)
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(pidfile.read_text()), 0)
            finally:
                if parent.poll() is None:
                    parent.kill()
                    parent.wait()


class DiagnoseTests(unittest.TestCase):
    def fixture(self, args, **kwargs):
        self.assertNotIn('compose', args)
        self.assertNotIn('logs', args)
        self.assertNotIn('up', args)
        self.assertGreater(kwargs['timeout'], 0)
        if args[1:3] == ['container', 'ls']:
            return 0, '\n'.join(['a' * 12] * 11), None
        names = ['api', 'envoy', 'local-jwks', 'db', 'rabbitmq', 'debezium', 'api-dapr-sidecar', 'migrate', 'bootstrap', 'api-ready', 'jaeger']
        return 0, '\n'.join(name + '|' + ('exited' if name in ('migrate', 'bootstrap', 'api-ready') else 'running') + '|0|sha256:' + 'b' * 64 for name in names), None

    def test_separate_liveness_startup_functional_readiness(self):
        report = diagnose.diagnose('user-private-project', 6060, run=self.fixture, probe=lambda *a: True)
        self.assertEqual(report['status'], 'passed')
        self.assertNotIn('user-private-project', json.dumps(report))
        statuses = {c['id']: c for c in report['commands']}
        self.assertEqual(statuses['gateway:liveness']['status'], 'passed')
        self.assertEqual(statuses['pipeline:functional-readiness']['status'], 'skipped')
        self.assertEqual(statuses['service:jaeger']['status'], 'skipped')
        self.assertIn('image_id', report['containers'][0])

    def test_privacy_malformed_timeout_and_missing_stack(self):
        for code, text, error in [(0, '', None), (None, '', 'timeout'), (1, 'Bearer planted-secret', None),
                                  (0, 'token=query&password=secret', None), (0, 'postgres://u:secret@host/db', None),
                                  (0, 'a' * 12 + '\n' * 1 + 'a' * 12, None)]:
            report = diagnose.diagnose('fixture', 6060, run=lambda *a, **kw: (code, text, error), probe=lambda *a: False)
            self.assertEqual(report['status'], 'blocked')
            for secret in ('planted-secret', 'password=secret', 'postgres://', 'Bearer'):
                self.assertNotIn(secret, json.dumps(report))

    @unittest.skipUnless(os.name == 'posix', 'POSIX fixture')
    def test_entrypoint_sigterm_cleans_inspector(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            pidfile = folder / 'pid'
            fake = folder / 'docker'
            fake.write_text('#!' + sys.executable + '\nimport os,time\nopen(' + repr(str(pidfile)) + ', "w").write(str(os.getpid()))\ntime.sleep(20)\n')
            fake.chmod(0o700)
            parent = subprocess.Popen([sys.executable, str(ROOT / 'scripts/diagnose.py'), '--project', 'fixture', '--port', '6060'],
                                      env=dict(os.environ, PATH=str(folder) + os.pathsep + os.environ['PATH']), stdout=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not pidfile.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(pidfile.exists())
                parent.send_signal(signal.SIGTERM)
                output, _ = parent.communicate(timeout=5)
                self.assertEqual(parent.returncode, 2)
                self.assertEqual(json.loads(output)['status'], 'blocked')
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(pidfile.read_text()), 0)
            finally:
                if parent.poll() is None:
                    parent.kill()
                    parent.wait()

    def test_inspect_template_does_not_read_environment(self):
        seen = []
        def run(args, **kwargs):
            seen.append(args)
            return self.fixture(args, **kwargs)
        diagnose.diagnose('fixture', 6060, run=run, probe=lambda *a: True)
        self.assertNotIn('.Config.Env', ' '.join(seen[1]))
        self.assertNotIn('.State.Health', ' '.join(seen[1]))


if __name__ == '__main__':
    unittest.main()
