#!/usr/bin/env python3
"""Bounded startup gate for an explicitly identified existing local Compose stack."""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import signal
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def states(rows, accounts):
    required = {"migrate", "bootstrap", "api-ready"}
    if accounts:
        required.update(("seed-accounts", "tokens"))
    running = {"api", "envoy", "local-jwks", "db"}
    by_service = {row["Service"]: row for row in rows}
    pending = []
    for name in sorted(required | running):
        row = by_service.get(name)
        if not row:
            pending.append(name)
            continue
        state = row.get("State", "")
        if state in ("dead", "removing") or state == "exited" and (name in running or int(row.get("ExitCode", -1)) != 0):
            return "failed", name + ": " + state
        if row.get("Health") == "unhealthy":
            return "failed", name + ": unhealthy"
        if name in required and state != "exited" or name in running and state != "running":
            pending.append(name)
    return ("pending", ", ".join(pending)) if pending else ("passed", "Required services completed startup")


def local_probe(port, timeout):
    # No proxy, redirect, body, credentials or arbitrary URL supplied by callers.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(f"http://127.0.0.1:{port}/api/healthz", timeout=timeout) as response:
            return response.status == 200
    except (OSError, ValueError):
        return False


def wait(project, accounts, port, credentials, timeout, poll=0.5, run=subprocess.run,
         probe=local_probe, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + timeout
    reason = "Startup not observed"
    while clock() < deadline:
        remaining = deadline - clock()
        try:
            result = run(["docker", "compose", "--project-name", project, "-f", str(ROOT / "compose.yml"),
                          "--profile", "*", "ps", "--all", "--format", "json"],
                         cwd=ROOT, capture_output=True, text=True, check=False, timeout=min(5, remaining))
            if result.returncode:
                return "failed", "Cannot inspect selected Compose project"
            # Compose versions support either an array or one JSON object per line.
            text = result.stdout.strip()
            rows = json.loads(text) if text.startswith('[') else [json.loads(line) for line in text.splitlines()]
            status, reason = states(rows, accounts)
            if status == "failed":
                return status, reason
            files = [credentials / "platform-token"]
            if accounts:
                files.append(credentials / "tokens.json")
            if status == "passed" and all(path.is_file() and path.stat().st_size > 0 for path in files):
                if probe(port, max(0.01, min(2, deadline - clock()))):
                    return "passed", "Startup ready (not continuous event-pipeline health)"
                reason = "Gateway /api/healthz is not ready"
            elif status == "passed":
                reason = "Required credential files not present/nonempty (values not read)"
        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
            return "failed", "Stack state inspection failed or timed out"
        sleep(min(poll, max(0, deadline - clock())))
    return "failed", "Startup timeout: " + reason


def start(project, accounts, timeout=600):
    """Bound Compose build/dependency startup; terminate only our CLI process group."""
    args = ["docker", "compose", "--progress", "quiet", "--project-name", project,
            "-f", str(ROOT / "compose.yml")]
    if accounts:
        args += ["--profile", "accounts"]
    args += ["up", "-d", "--build"]
    try:
        process = subprocess.Popen(args, cwd=ROOT, start_new_session=True)
    except OSError:
        return False
    try:
        return process.wait(timeout=timeout) == 0
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--start", action="store_true", help="Explicitly authorize Compose startup (bounded to 600s)")
    parser.add_argument("--accounts", action="store_true")
    parser.add_argument("--port", type=int, default=int(os.environ.get("KAITEN_PORT", "6060")))
    parser.add_argument("--credentials", type=Path, default=Path(os.environ.get("KAITEN_DEV_DIR", ROOT / "dev")))
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or not math.isfinite(args.timeout) or not 0 < args.timeout <= 600:
        parser.error("port must be 1..65535 and timeout must be >0 and <=600 seconds")
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    if args.start and not start(args.project, args.accounts):
        print("failed: Compose startup failed, was interrupted or exceeded 600s; selected stack retained")
        return 1
    try:
        status, reason = wait(args.project, args.accounts, args.port, args.credentials, args.timeout)
    except KeyboardInterrupt:
        status, reason = "failed", "Startup gate interrupted; selected stack retained"
    print(f"{status}: {reason}")
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
