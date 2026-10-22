#!/usr/bin/env python3
"""Bounded, non-fixing checks and private allowlisted evidence; no install or startup."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time
import uuid

import doctor

ROOT = Path(__file__).resolve().parents[1]
STATES = ('passed', 'failed', 'blocked', 'skipped')
AREAS = ('tooling', 'backend', 'frontend', 'theme', 'generator', 'charts', 'wasm')


def now():
    return datetime.now(timezone.utc).isoformat()


def execute(args, cwd=ROOT, timeout=30, limit=131072):
    """Discard stderr/stdout after a bounded capture; terminate only our process group."""
    env = dict(os.environ, GOTOOLCHAIN='local', GOPROXY='off', GOSUMDB='off',
               GONOPROXY='none', GOAUTH='off', GIT_TERMINAL_PROMPT='0',
               COREPACK_ENABLE_NETWORK='0', COREPACK_ENABLE_AUTO_PIN='0', CARGO_NET_OFFLINE='true')
    # No inherited private-module exceptions or credentials in offline inspection.
    for key in list(env):
        if key.startswith('GO') and ('PRIVATE' in key or key.endswith('AUTH')):
            env.pop(key)
    env['GOAUTH'] = 'off'
    child = None
    output = bytearray()
    deadline = time.monotonic() + timeout
    try:
        child = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                 stderr=subprocess.DEVNULL, start_new_session=True)
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            while selector.get_map():
                if time.monotonic() >= deadline:
                    return None, '', 'timeout'
                for key, _ in selector.select(min(.1, max(0, deadline - time.monotonic()))):
                    chunk = os.read(key.fileobj.fileno(), 8192)
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        output.extend(chunk)
                        if len(output) > limit:
                            return None, '', 'output_limit'
            code = child.wait(timeout=max(.01, deadline - time.monotonic()))
        return code, output.decode('utf-8', errors='replace'), None
    except (OSError, subprocess.TimeoutExpired):
        return None, '', 'unavailable'
    except KeyboardInterrupt:
        return None, '', 'interrupted'
    finally:
        if child:
            # Descendants may survive the direct child; always clean our own group.
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            child.stdout.close()


def identity(run=execute):
    code, revision, _ = run(['git', 'rev-parse', 'HEAD'])
    revision = revision.strip()
    code_dirty, dirty, _ = run(['git', 'status', '--porcelain'])
    return {'revision': revision if code == 0 and re.fullmatch(r'[a-f0-9]{40,64}', revision) else None,
            'dirty': bool(dirty) if code_dirty == 0 else None}


def signature(profile, commands):
    # No revision, date, duration, local path or subprocess text: stable across reruns.
    failures = sorted([{'id': c['id'], 'status': c['status'], 'reason': c['reason']}
                       for c in commands if c['status'] in ('failed', 'blocked')], key=lambda c: c['id'])
    key = json.dumps({'schema': 1, 'profile': profile, 'findings': failures}, sort_keys=True)
    return 'kaiten-audit-v1-' + hashlib.sha256(key.encode()).hexdigest()[:24]


def record(name, status, reason, started=None, duration=0, exit_code=None):
    return {'id': name, 'status': status, 'reason': reason, 'exit_code': exit_code,
            'started_at': started or now(), 'ended_at': now(), 'duration_seconds': round(duration, 3)}


def manifest(profile, commands, started, tools=None, repo=None):
    status = 'failed' if any(c['status'] == 'failed' for c in commands) else 'blocked' if any(c['status'] == 'blocked' for c in commands) else 'passed'
    return {'schema_version': 1, 'repository': repo or identity(), 'profile': profile,
            'started_at': started, 'ended_at': now(), 'status': status,
            'tool_versions': tools or {}, 'commands': commands,
            'finding_key': signature(profile, commands), 'artifacts': [], 'private': True}


def save(report, root=ROOT):
    """Create only a new ignored private directory. Never accept an arbitrary output path."""
    base = root / '.audit'
    if base.is_symlink():
        raise ValueError('Evidence directory must not be a symlink')
    base.mkdir(mode=0o700, exist_ok=True)
    # Existing directories may be user-owned: refuse unsafe permissions, do not chmod them.
    if base.stat().st_mode & 0o077:
        raise ValueError('Evidence directory must be private (mode 700)')
    folder = base / uuid.uuid4().hex
    folder.mkdir(mode=0o700)
    relative = (folder / 'manifest.json').relative_to(root).as_posix()
    report['artifacts'] = [relative]
    fd = os.open(folder / 'manifest.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(report, stream, indent=2)
        stream.write('\n')


def gates(profile, areas):
    """Thin inventory of existing repo gates. No business tests live here."""
    if len(areas) > 1:
        # Evaluate coverage for every selected area, not only the whole selection.
        combined = {}
        for area in areas:
            for gate in gates(profile, [area]):
                combined.setdefault(gate[0], gate)
        return list(combined.values())
    result = []
    def add(area, name, argv, directory='.', prerequisite=None):
        if area in areas:
            result.append((name, argv, ROOT / directory, prerequisite or ('backend' if area == 'backend' else 'charts' if area == 'charts' else 'frontend')))
    if profile == 'static':
        add('tooling', 'tooling:fixtures', ['python3', '-m', 'unittest', 'discover', '-s', 'scripts/tests', '-v'], prerequisite='node')
        add('tooling', 'tooling:node-fixtures', ['node', '--test', 'app/scripts/stack-process.test.mjs', 'scripts/tests/nightly-finding.test.cjs'], prerequisite='node')
        add('backend', 'backend:dependencies', ['sh', 'scripts/check-deps.sh'])
        for module in ('api', 'api/cmd/schema-docs'):
            for verb in ('build', 'vet'):
                add('backend', module + ':' + verb, ['go', verb, '-mod=readonly', './...'], module)
            add('backend', module + ':tidy', ['go', 'mod', 'tidy', '-diff'], module)
        add('backend', 'backend:endpoints', ['go', 'run', '-mod=readonly', './cmd/checkapierrors'], 'api')
        add('backend', 'backend:lint', None, prerequisite='offline-lint')
        for name in ('fmt:check', 'lint', 'typecheck', 'typecheck:e2e', 'check:lint-parity', 'check:architecture', 'check:e2e-contracts', 'check:i18n-parity', 'check:i18n-keys', 'check:api-error-i18n', 'check:file-sizes'):
            add('frontend', 'frontend:' + name, ['pnpm', 'run', name], 'app')
        add('frontend', 'frontend:contrast', ['node', 'scripts/check-token-contrast.mjs'])
        add('theme', 'theme:check', ['pnpm', 'run', 'check'], 'packages/theme')
        add('charts', 'charts:render', ['task', '--exit-code', 'test:charts'])
        # Regeneration/build gates can overwrite tracked generated files; never run here.
        for area in ('frontend', 'theme', 'generator', 'wasm'):
            if area in areas:
                result.append((area + ':owned-build-drift', None, ROOT, 'owned-checkout'))
    elif profile == 'unit':
        add('tooling', 'tooling:fixtures', ['python3', '-m', 'unittest', 'discover', '-s', 'scripts/tests', '-v'], prerequisite='node')
        add('tooling', 'tooling:node-fixtures', ['node', '--test', 'app/scripts/stack-process.test.mjs', 'scripts/tests/nightly-finding.test.cjs'], prerequisite='node')
        add('frontend', 'frontend:unit', ['pnpm', 'run', 'test'], 'app')
        add('generator', 'generator:unit', ['pnpm', 'run', 'test'], 'packages/api-codegen')
        add('wasm', 'wasm:unit', ['pnpm', 'run', 'test:cel-engine'], 'app')
        if 'backend' in areas:
            result.append(('backend:normal-race', None, ROOT, 'owned-runtime'))
    elif profile == 'runtime':
        for area, names in {'backend': ('backend:normal-race',), 'frontend': ('browser:chromium-shards', 'browser:firefox-webkit', 'browser:dev-mock', 'browser:storybook-visual', 'runtime:authenticated-stack'), 'wasm': ('wasm:browser',)}.items():
            if area in areas:
                for name in names:
                    result.append((name, None, ROOT, 'owned-runtime'))
    elif profile == 'security':
        if 'backend' in areas:
            result.append(('security:govulncheck', None, ROOT, 'security-database'))
        result.append(('security:gitleaks', None, ROOT, 'security-private-input'))
    if not result:
        result.append(('coverage:' + profile + ':' + areas[0], None, ROOT, 'unsupported'))
    return result


def check(profile, areas, timeout=600, run=execute, inspect=doctor.inspect):
    started = now()
    commands, tools, prerequisites = [], {}, {}
    for name, args, cwd, prerequisite in gates(profile, areas):
        if args is None:
            reasons = {'owned-runtime': 'Explicit owned-runtime authorization required; no stack or testcontainers started',
                       'owned-checkout': 'Build and generated drift checks require an explicitly owned clean checkout',
                       'security-database': 'Scanner and vulnerability database access require explicit setup/authorization',
                       'security-private-input': 'Secret scan can inspect private ignored inputs; use an authorized isolated checkout',
                       'offline-lint': 'Existing Task lint may resolve a named Go toolchain; run only after explicit cached-toolchain verification',
                       'unsupported': 'No non-fixing gate for selected profile/area; coverage is not a pass'}
            commands.append(record(name, 'blocked', reasons[prerequisite]))
            continue
        if prerequisite not in prerequisites:
            if prerequisite == 'node':
                code, output, error = run(['node', '--version'], timeout=5)
                version = output.strip() if re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+\s*', output) else ''
                prerequisites[prerequisite] = {'status': 'passed' if code == 0 and version and int(version.split('.')[0][1:]) >= 24 else 'blocked', 'checks': []}
                tools['node'] = version or 'unavailable'
            elif prerequisite == 'tooling':
                prerequisites[prerequisite] = {'status': 'passed', 'checks': []}
            else:
                prerequisites[prerequisite] = inspect(prerequisite)
            for item in prerequisites[prerequisite]['checks']:
                if item['status'] != 'skipped':
                    tools[prerequisite + ':' + item['name']] = item['reason']
        if prerequisites[prerequisite]['status'] == 'blocked':
            commands.append(record(name, 'blocked', 'Prerequisite profile ' + prerequisite + ' is blocked'))
            continue
        began, tick = now(), time.monotonic()
        code, _, error = run(args, cwd=cwd, timeout=timeout)
        status = 'blocked' if error == 'unavailable' else 'failed' if error or code else 'passed'
        reason = error or ('command_failed' if code else 'command_passed')
        commands.append(record(name, status, reason, began, time.monotonic() - tick, code))
        if error == 'interrupted':
            break
    return manifest(profile, commands, started, tools)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', choices=('static', 'unit', 'runtime', 'security'), required=True)
    parser.add_argument('--area', choices=AREAS, action='append', help='Repeat for selected areas; omitted means all, never Git diff narrowing')
    parser.add_argument('--timeout', type=float, default=600, help='Per gate bound, 1..600 seconds')
    parser.add_argument('--evidence', action='store_true', help='Write a new ignored private manifest')
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or not 1 <= args.timeout <= 600:
        parser.error('timeout must be finite and 1..600')
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    report = check(args.profile, args.area or AREAS, args.timeout)
    if args.evidence:
        try:
            save(report)
        except (OSError, ValueError):
            report['status'] = 'failed'
            report['commands'].append(record('evidence:write', 'failed', 'Cannot safely write private evidence'))
            report['finding_key'] = signature(report['profile'], report['commands'])
    print(json.dumps(report))
    return {'passed': 0, 'failed': 1, 'blocked': 2}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())
