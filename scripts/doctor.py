#!/usr/bin/env python3
"""Read-only prerequisite inspection. Never install, start services or read credentials."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROFILES = ("backend", "lint", "frontend", "charts", "runtime", "tests", "all")


def command(args, cwd=ROOT, timeout=5):
    env = dict(os.environ, GOTOOLCHAIN="local", GOPROXY="off", GOSUMDB="off", GONOPROXY="none", GOAUTH="off",
               GIT_TERMINAL_PROMPT="0", COREPACK_ENABLE_NETWORK="0", COREPACK_ENABLE_AUTO_PIN="0")
    # No inherited private-module exceptions or credentials in offline inspection.
    for key in list(env):
        if key.startswith('GO') and ('PRIVATE' in key or key.endswith('AUTH')):
            env.pop(key)
    env['GOAUTH'] = 'off'
    try:
        result = subprocess.run(args, cwd=cwd, env=env, capture_output=True,
                                text=True, timeout=timeout, check=False)
        return result.returncode, result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 2, ""


def inspect(profile, root=ROOT, run=command, which=shutil.which):
    checks = []

    def add(name, ok, reason):
        checks.append({"name": name, "status": "passed" if ok else "blocked", "reason": reason})

    def tool(name, args, pattern=None, expected=None):
        if not which(name):
            add(name, False, f"Install {name} explicitly before selecting this profile")
            return
        code, output = run(args)
        match = re.search(pattern, output) if pattern else None
        version = match.group(1) if match else None
        ok = code == 0 and (expected is None or version == expected)
        # Only allowlisted version strings, never arbitrary subprocess output.
        add(name, ok, f"Detected {(version or 'available') if code == 0 else 'unavailable'}; required {expected or 'working command'}")

    tool("git", ["git", "--version"], r"git version ([0-9.]+)")
    tool("task", ["task", "--version"], r"(?:v)?([0-9]+\.[0-9]+\.[0-9]+)")
    code, dirty = run(["git", "status", "--porcelain"], cwd=root)
    add("worktree", code == 0, "Dirty; preserve existing work" if dirty else "Clean" if code == 0 else "Cannot inspect Git state")
    for area in ("backend", "lint", "frontend", "charts", "runtime"):
        selected = profile in (area, "all") or area == "backend" and profile in ("lint", "tests")
        if not selected:
            checks.append({"name": area, "status": "skipped", "reason": "Not selected"})
            continue
        if area == "backend":
            for module in ("api", "api/cmd/schema-docs"):
                try:
                    text = (root / module / "go.mod").read_text()
                    required = re.search(r"^go ([0-9]+\.[0-9]+\.[0-9]+)$", text, re.M).group(1)
                except (OSError, AttributeError):
                    add(module + ":config", False, "Missing or invalid go.mod Go version; restore module configuration")
                    continue
                code, output = run(["go", "version"], cwd=root / module)
                match = re.search(r"go([0-9.]+)", output)
                version = match.group(1) if match else ""
                ok = code == 0 and bool(version) and tuple(map(int, version.split('.'))) >= tuple(map(int, required.split('.')))
                add(module + ":go", ok, f"Detected {version or 'unavailable'}; requires Go >= {required}; install explicitly")
                if ok:
                    graph_code, _ = run(["go", "list", "-mod=readonly", "-m", "all"], cwd=root / module)
                    add(module + ":dependencies", graph_code == 0,
                        "Dependency graph must resolve offline; resolve missing dependencies explicitly")
                else:
                    checks.append({"name": module + ":dependencies", "status": "skipped",
                                   "reason": "Toolchain blocked; no dependency resolution attempted"})
        elif area == "lint":
            # No `go run` or auto toolchain resolution: only existing local binaries.
            code, output = run(["go1.27.1", "version"])
            code_go, local = run(["go", "version"])
            add("lint:go", code == 0 and "go1.27.1 " in output or code_go == 0 and "go1.27.1 " in local,
                "CI requires Go 1.27.1 for golangci-lint v2.13.1; install the toolchain explicitly if unavailable")
        elif area == "frontend":
            try:
                node = (root / "app/.nvmrc").read_text().strip().lstrip("v")
                if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,2}", node):
                    raise ValueError("invalid pin")
                package = json.loads((root / "package.json").read_text())["packageManager"].split('@')[1]
                if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", package):
                    raise ValueError("invalid pin")
            except (OSError, ValueError, KeyError, IndexError, TypeError):
                add("frontend:config", False, "Missing or invalid Node/pnpm pins; restore app/.nvmrc and package.json")
                continue
            tool("node", ["node", "--version"], r"v([0-9]+)", node.split('.')[0])
            tool("pnpm", ["pnpm", "--version"], r"^([0-9.]+)$", package)
            add("frontend:dependencies", (root / "node_modules").is_dir() and (root / "app/node_modules").is_dir(),
                "Workspace dependencies must already be installed; doctor never installs")
        elif area == "charts":
            tool("helm", ["helm", "version", "--short"], r"v([0-9.]+)")
        elif area == "runtime":
            tool("docker", ["docker", "--version"], r"version ([0-9.]+)")
            code, _ = run(["docker", "compose", "version"])
            add("compose", code == 0, "Docker Compose v2 is required")
            code, _ = run(["docker", "info", "--format", "{{.ServerVersion}}"])
            add("docker:daemon", code == 0, "Docker daemon must already be reachable; doctor never starts it")
            add("runtime:config", (root / ".env").is_file(), "Create .env from .env.example explicitly; values are not inspected")
            credentials = Path(os.environ.get("KAITEN_DEV_DIR", str(root / "dev")))
            checks.append({"name": "runtime:credential",
                           "status": "passed" if (credentials / "platform-token").is_file() else "skipped",
                           "reason": "Credential file presence only; absent before first startup is expected"})
    if profile == "tests":
        code, _ = run(["docker", "info", "--format", "{{.ServerVersion}}"])
        add("tests:docker", code == 0, "Full backend tests require an already reachable Docker daemon")
    status = "blocked" if any(c["status"] == "blocked" for c in checks) else "passed"
    return {"schema_version": 1, "profile": profile, "status": status, "checks": checks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=PROFILES, default="backend")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    report = inspect(args.profile)
    if args.json:
        print(json.dumps(report))
    else:
        for item in report["checks"]:
            print(f'{item["status"]}: {item["name"]}: {item["reason"]}')
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
