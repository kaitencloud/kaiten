#!/usr/bin/env python3
"""Read-only bounded diagnostics of an explicitly named existing local Docker stack."""
import argparse
import json
import re
import signal
import time

from audit import execute, manifest, now, record, save, signature

SERVICES = ('api', 'envoy', 'local-jwks', 'db', 'migrate', 'bootstrap', 'api-ready',
            'seed-accounts', 'tokens', 'seed-data', 'rabbitmq', 'debezium', 'api-dapr-sidecar', 'jaeger')
CONTAINER_STATES = ('created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead')


def diagnose(project, port, accounts=False, timeout=15, run=execute, probe=None):
    # Never render Compose or inspect environments, names, labels other than service, logs or health output.
    from importlib.util import spec_from_file_location, module_from_spec
    from pathlib import Path
    if probe is None:
        spec = spec_from_file_location('wait_stack', Path(__file__).with_name('wait-stack.py'))
        stack = module_from_spec(spec)
        spec.loader.exec_module(stack)
        probe = stack.local_probe
    started, tick = now(), time.monotonic()
    commands, containers = [], []
    def remaining():
        return max(.01, timeout - (time.monotonic() - tick))
    code, output, error = run(['docker', 'container', 'ls', '--all', '--filter',
                               'label=com.docker.compose.project=' + project, '--format', '{{.ID}}'], timeout=remaining())
    ids = output.split()
    if error or code or len(ids) > 40 or any(not re.fullmatch(r'[a-f0-9]{12,64}', i) for i in ids):
        commands.append(record('stack:inspect', 'blocked', 'Docker inspection unavailable or exceeded bound', started, time.monotonic() - tick, code))
    elif not ids:
        commands.append(record('stack:inspect', 'blocked', 'Selected existing project has no containers', started, time.monotonic() - tick, code))
    else:
        template = '{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{.State.ExitCode}}|{{.Image}}'
        code, output, error = run(['docker', 'container', 'inspect', '--format', template, *ids], timeout=remaining())
        rows = output.splitlines()
        valid = not error and code == 0 and len(rows) == len(ids)
        for row in rows:
            fields = row.split('|')
            if (len(fields) != 4 or fields[0] not in SERVICES or fields[1] not in CONTAINER_STATES
                    or not re.fullmatch(r'[0-9]{1,3}', fields[2]) or not re.fullmatch(r'sha256:[a-f0-9]{64}', fields[3])):
                valid = False
                break
            containers.append({'service': fields[0], 'state': fields[1], 'exit_code': int(fields[2]), 'image_id': fields[3]})
        if not valid:
            containers = []
            commands.append(record('stack:inspect', 'blocked', 'Invalid or unavailable allowlisted container metadata', started, time.monotonic() - tick, code))
        else:
            commands.append(record('stack:inspect', 'passed', 'Allowlisted container metadata only', started, time.monotonic() - tick, code))
            by_service = {r['service']: r for r in containers}
            required_running = ('api', 'envoy', 'local-jwks', 'db', 'rabbitmq', 'debezium', 'api-dapr-sidecar')
            one_shots = ('migrate', 'bootstrap', 'api-ready') + (('seed-accounts', 'tokens') if accounts else ())
            for name in SERVICES:
                row = by_service.get(name)
                if name not in required_running + one_shots:
                    commands.append(record('service:' + name, 'skipped', 'Optional module not selected; presence is not functional readiness'))
                elif not row:
                    commands.append(record('service:' + name, 'blocked', 'Required service absent'))
                else:
                    ok = row['state'] == 'running' if name in required_running else row['state'] == 'exited' and row['exit_code'] == 0
                    commands.append(record('service:' + name, 'passed' if ok else 'failed',
                                           'Process liveness only' if name in required_running and ok else 'Startup latch completed; not continuous readiness' if ok else 'Required service state unsuccessful', exit_code=row['exit_code']))
            began, probe_tick = now(), time.monotonic()
            ok = probe(port, min(2, remaining()))
            commands.append(record('gateway:liveness', 'passed' if ok else 'failed', 'HTTP health liveness only; no response body captured', began, time.monotonic() - probe_tick))
            commands.append(record('pipeline:functional-readiness', 'skipped', 'No synthetic event or authenticated request sent; HTTP 200 does not prove pipeline readiness'))
    report = manifest('diagnose', commands, started)
    report['containers'] = containers
    # Project names may contain user data; publish only its opaque hash, never the name.
    import hashlib
    report['stack_identity'] = hashlib.sha256(project.encode()).hexdigest()[:24]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='Existing Docker Compose project; no implicit default')
    parser.add_argument('--port', type=int, required=True, help='Selected stack loopback gateway port')
    parser.add_argument('--accounts', action='store_true')
    parser.add_argument('--evidence', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', args.project) or not 1 <= args.port <= 65535:
        parser.error('project must be a valid bounded Compose identifier; port must be 1..65535')
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    report = diagnose(args.project, args.port, args.accounts)
    if args.evidence:
        try:
            save(report)
        except (OSError, ValueError):
            report['commands'].append(record('evidence:write', 'failed', 'Cannot safely write private evidence'))
            report['status'] = 'failed'
            report['finding_key'] = signature(report['profile'], report['commands'])
    print(json.dumps(report))
    return {'passed': 0, 'failed': 1, 'blocked': 2}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())
