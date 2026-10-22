import importlib.util
import json
import os
import signal
import sys
import time
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


doctor = load('doctor', 'doctor.py')
stack = load('stack', 'wait-stack.py')


class DependencyTests(unittest.TestCase):
    def test_graphs(self):
        # A standalone synthetic repo; never invoke the real Go toolchain.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'api/cmd/schema-docs').mkdir(parents=True)
            (root / 'scripts/check-deps.sh').write_text((ROOT / 'scripts/check-deps.sh').read_text())
            binary = root / 'go'
            for body, expected in [('exit 17', 17),
                                   ("printf '%s\\n' github.com/kaitencloud/kaiten/api 'github.com/kaitencloud/sdk-go v1.0.0'", 0),
                                   ("printf '%s\\n' 'github.com/kaitencloud/saas-api v1.0.0'", 1)]:
                binary.write_text('#!/bin/sh\n' + body + '\n')
                binary.chmod(0o700)
                result = subprocess.run(['/bin/sh', str(root / 'scripts/check-deps.sh')],
                                        env={'PATH': str(root) + ':/usr/bin:/bin'}, capture_output=True)
                self.assertEqual(result.returncode, expected)


class DoctorTests(unittest.TestCase):
    def fixture(self, root):
        for module in ('api', 'api/cmd/schema-docs'):
            (root / module).mkdir(parents=True, exist_ok=True)
            (root / module / 'go.mod').write_text('module example\ngo 1.27.0\n')
        (root / 'app').mkdir()
        (root / 'app/.nvmrc').write_text('24\n')
        (root / 'package.json').write_text('{"packageManager":"pnpm@12.4.1"}')

    def test_missing_and_optional_tools(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            def run(args, **kwargs):
                return (0, 'go version go1.27.2 darwin/arm64') if args == ['go', 'version'] else (0, '')
            report = doctor.inspect('backend', root, run, lambda name: '/fixture/' + name)
            self.assertEqual(report['status'], 'passed')
            self.assertTrue(any(c['name'] == 'frontend' and c['status'] == 'skipped' for c in report['checks']))
            report = doctor.inspect('backend', root, lambda *a, **kw: (2, ''), lambda name: None)
            self.assertEqual(report['status'], 'blocked')

    def test_dirty_and_privacy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root / '.env').write_text('TOKEN=secret-query?token=abcdef\n')
            def run(args, **kwargs):
                if args[0] == 'go':
                    return 0, 'go version go1.27.2 linux/amd64'
                if args[:2] == ['git', 'status']:
                    return 0, ' M secret-file'
                return 0, 'Authorization: Bearer fixture-secret'
            report = doctor.inspect('backend', root, run, lambda name: name)
            serialized = json.dumps(report)
            self.assertNotIn('fixture-secret', serialized)
            self.assertNotIn('secret-file', serialized)
            self.assertNotIn('abcdef', serialized)
            self.assertIn('Dirty; preserve', serialized)

    def test_missing_or_malformed_configuration_is_blocked_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for profile in ('backend', 'frontend'):
                report = doctor.inspect(profile, root, lambda *a, **kw: (0, ''), lambda name: name)
                self.assertEqual(report['status'], 'blocked')
                json.dumps(report)
            self.fixture(root)
            (root / 'package.json').write_text('{broken')
            report = doctor.inspect('frontend', root, lambda *a, **kw: (0, ''), lambda name: name)
            self.assertEqual(report['status'], 'blocked')

    def test_commands_are_bounded_and_offline(self):
        with patch.object(doctor.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')) as run:
            doctor.command(['go', 'version'])
            env = run.call_args.kwargs['env']
            self.assertEqual(env['GOTOOLCHAIN'], 'local')
            self.assertEqual(env['GOPROXY'], 'off')
            self.assertEqual(env['GONOPROXY'], 'none')
            self.assertEqual(env['COREPACK_ENABLE_NETWORK'], '0')
            self.assertGreater(run.call_args.kwargs['timeout'], 0)
        with patch.object(doctor.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture', 5)):
            self.assertEqual(doctor.command(['fixture']), (2, ''))

    def test_runtime_credential_override_is_presence_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            credentials = root / 'owned'
            credentials.mkdir()
            token = credentials / 'platform-token'
            token.write_text('private-do-not-read')
            with patch.dict(os.environ, {'KAITEN_DEV_DIR': str(credentials)}), \
                    patch.object(Path, 'read_text', side_effect=AssertionError('must not read credentials')):
                report = doctor.inspect('runtime', root, lambda *a, **kw: (0, ''), lambda name: name)
            check = next(item for item in report['checks'] if item['name'] == 'runtime:credential')
            self.assertEqual(check['status'], 'passed')
            self.assertNotIn('private-do-not-read', json.dumps(report))

    def test_no_install_command_contract(self):
        report = doctor.inspect('backend')
        self.assertIn(report['status'], ('passed', 'blocked'))
        self.assertEqual(report['schema_version'], 1)


class StackTests(unittest.TestCase):
    def rows(self, accounts=False):
        one_shots = ['migrate', 'bootstrap', 'api-ready'] + (['seed-accounts', 'tokens'] if accounts else [])
        return ([{'Service': name, 'State': 'exited', 'ExitCode': 0} for name in one_shots] +
                [{'Service': name, 'State': 'running'} for name in ('api', 'envoy', 'db', 'local-jwks')])

    def test_successful_one_shots_and_selected_profiles(self):
        self.assertEqual(stack.states(self.rows(), False)[0], 'passed')
        self.assertEqual(stack.states(self.rows(), True)[0], 'pending')
        self.assertEqual(stack.states(self.rows(True), True)[0], 'passed')

    def test_failed_migration_or_api(self):
        for service in ('migrate', 'api'):
            rows = self.rows()
            next(row for row in rows if row['Service'] == service).update(State='exited', ExitCode=1)
            status, reason = stack.states(rows, False)
            self.assertEqual(status, 'failed')
            self.assertIn(service, reason)

    def test_delayed_success_timeout_and_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            credentials = Path(directory)
            (credentials / 'platform-token').write_text('private-fixture')
            ticks = [0]
            def clock():
                return ticks[0]
            def sleep(seconds):
                ticks[0] += seconds
            calls = []
            def run(args, **kwargs):
                calls.append((args, kwargs))
                rows = [] if len(calls) == 1 else self.rows()
                return subprocess.CompletedProcess(args, 0, json.dumps(rows), 'secret-error')
            status, reason = stack.wait('fixture-owned', False, 6060, credentials, 2,
                                        run=run, probe=lambda *args: True, clock=clock, sleep=sleep)
            self.assertEqual(status, 'passed')
            self.assertGreater(len(calls), 1)
            self.assertTrue(all('fixture-owned' in call[0] for call in calls))
            ticks[0] = 0
            status, reason = stack.wait('fixture-owned', True, 6060, credentials, 1,
                                        run=run, probe=lambda *args: False, clock=clock, sleep=sleep)
            self.assertEqual(status, 'failed')
            self.assertIn('timeout', reason)
            self.assertNotIn('secret', reason)

    def test_start_timeout_and_interrupt_only_terminate_owned_cli(self):
        for error in (subprocess.TimeoutExpired('docker', 1), KeyboardInterrupt()):
            process = Mock(pid=12345)
            process.wait.side_effect = [error, 0]
            with patch.object(stack.subprocess, 'Popen', return_value=process) as popen, \
                    patch.object(stack.os, 'killpg') as kill:
                self.assertFalse(stack.start('fixture-owned', True, timeout=1))
                self.assertTrue(popen.call_args.kwargs['start_new_session'])
                args = popen.call_args.args[0]
                self.assertIn('fixture-owned', args)
                self.assertIn('accounts', args)
                kill.assert_called_once_with(12345, stack.signal.SIGTERM)
                self.assertNotIn('down', args)

    @unittest.skipUnless(os.name == 'posix', 'Process-group fixture requires POSIX')
    def test_real_sigterm_cleans_owned_child(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pidfile = root / 'pid'
            fake = root / 'docker'
            fake.write_text('#!' + sys.executable + '\nimport os,time\n'
                            + 'open(' + repr(str(pidfile)) + ', "w").write(str(os.getpid()))\n'
                            + 'time.sleep(20)\n')
            fake.chmod(0o700)
            env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'])
            parent = subprocess.Popen([sys.executable, str(ROOT / 'scripts/wait-stack.py'),
                                       '--start', '--project', 'fixture-owned'], env=env,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not pidfile.exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(pidfile.exists())
                child = int(pidfile.read_text())
                parent.send_signal(signal.SIGTERM)
                output, errors = parent.communicate(timeout=8)
                self.assertEqual(parent.returncode, 1, errors)
                with self.assertRaises(ProcessLookupError):
                    os.kill(child, 0)
            finally:
                if parent.poll() is None:
                    parent.kill()
                    parent.wait()
                if pidfile.exists():
                    try:
                        os.kill(int(pidfile.read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass

    def test_invalid_deadlines_rejected_without_docker(self):
        for value in ('nan', 'inf', '0', '-1'):
            with patch('sys.argv', ['wait-stack', '--project', 'fixture', '--timeout', value]), \
                    patch.object(stack, 'wait') as wait, patch('sys.stderr'):
                with self.assertRaises(SystemExit) as error:
                    stack.main()
                self.assertEqual(error.exception.code, 2)
                wait.assert_not_called()

    def test_compose_ready_gate_uses_elapsed_deadline_not_attempt_count(self):
        text = (ROOT / 'compose.yml').read_text()
        gate = text[text.index('  api-ready:'):text.index('  seed-data:')]
        self.assertIn('deadline=$$(($$(date +%s)+120))', gate)
        self.assertIn('[ "$$(date +%s)" -ge "$$deadline" ]', gate)
        self.assertNotIn('"$$i" -ge 20', gate)
        self.assertIn('wget -T 2', gate)

    def test_compose_ready_waits_after_fast_failures_and_times_out(self):
        text = (ROOT / 'compose.yml').read_text()
        gate = text[text.index('  api-ready:'):text.index('  seed-data:')]
        start = gate.index('        deadline=')
        end = gate.index('        echo "API is serving"')
        script = '\n'.join(line[8:] for line in gate[start:end].splitlines()).replace('$$', '$')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for succeeds in (True, False):
                (root / 'clock').write_text('0')
                (root / 'attempts').write_text('0')
                (root / 'date').write_text('#!/bin/sh\ncat "$FIXTURE/clock"\n')
                (root / 'sleep').write_text('#!/bin/sh\nn=$(cat "$FIXTURE/clock"); echo $((n+1)) > "$FIXTURE/clock"\n')
                (root / 'wget').write_text('#!/bin/sh\nn=$(cat "$FIXTURE/attempts"); n=$((n+1)); echo "$n" > "$FIXTURE/attempts"\n'
                                          + ('[ "$n" -ge 30 ]\n' if succeeds else 'exit 1\n'))
                for name in ('date','sleep','wget'):
                    (root / name).chmod(0o700)
                env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'], FIXTURE=str(root), KAITEN_PORT='6060')
                result = subprocess.run(['/bin/sh','-c',script],env=env,capture_output=True,timeout=30)
                self.assertEqual(result.returncode,0 if succeeds else 1)
                self.assertGreater(int((root / 'attempts').read_text()),20)

    def test_subprocess_timeout(self):
        def run(*args, **kwargs):
            raise subprocess.TimeoutExpired('docker', 1)
        status, reason = stack.wait('fixture', False, 6060, Path('/absent'), 1, run=run)
        self.assertEqual(status, 'failed')
        self.assertIn('timed out', reason)


if __name__ == '__main__':
    unittest.main()
