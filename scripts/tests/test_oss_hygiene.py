"""Offline fixtures for the actual OSS workflow's build-artifact run body."""

import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHELLS = ['/bin/sh', '/bin/bash']
if shutil.which('dash'):
    SHELLS.append(shutil.which('dash'))


def artifact_guard():
    # Extract this literal block only, without adding a YAML dependency. Fail if
    # its format changes rather than silently testing a stale copy of the guard.
    workflow = (ROOT / '.github/workflows/oss-hygiene.yml').read_text()
    marker = '      - name: No committed build artifacts\n        run: |\n'
    if workflow.count(marker) != 1:
        raise AssertionError('Expected one build-artifact run block')
    block = workflow.split(marker)[1].split('\n      - name:', 1)[0]
    if any(line and not line.startswith('          ') for line in block.splitlines()):
        raise AssertionError('Unexpected run block indentation')
    return textwrap.dedent(block).strip() + '\n'


class ArtifactGuardTests(unittest.TestCase):
    def test_shell_syntax(self):
        for shell in SHELLS:
            with self.subTest(shell=shell):
                result = subprocess.run([shell, '-n'], input=artifact_guard(),
                                        text=True, capture_output=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_allowed_sources_and_compiled_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', str(root)], check=True,
                           capture_output=True, timeout=10)
            api = root / 'api'
            api.mkdir()
            for extension in ('go', 'md', 'sql', 'yaml', 'yml', 'json', 'txt', 'tmpl'):
                (api / ('source.' + extension)).write_text('allowed source\n')
            (api / 'plain').write_text('plain text without an extension\n')
            # Never execute the copied binary. Use the host executable so `file`
            # exercises Mach-O locally and ELF on the Linux CI runner.
            shutil.copyfile('/bin/sh', api / 'allowed.go')
            shutil.copyfile('/bin/sh', root / 'outside-api')
            subprocess.run(['git', 'add', '--', '.'], cwd=root, check=True,
                           capture_output=True, timeout=10)
            shutil.copyfile('/bin/sh', api / 'untracked-binary')
            for shell in SHELLS:
                with self.subTest(shell=shell, artifacts=False):
                    result = subprocess.run([shell, '-e'], cwd=root,
                                            input=artifact_guard(), text=True,
                                            capture_output=True, timeout=10)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout, '')

            binary = api / 'compiled-binary'
            shutil.copyfile('/bin/sh', binary)
            mime = subprocess.run(['file', '--mime-type', '-b', str(binary)],
                                  check=True, text=True, capture_output=True, timeout=10)
            self.assertRegex(mime.stdout, r'application/x-(executable|mach-binary|sharedlib)')
            subprocess.run(['git', 'add', '--', 'api/compiled-binary'], cwd=root,
                           check=True, capture_output=True, timeout=10)
            for shell in SHELLS:
                with self.subTest(shell=shell, artifacts=True):
                    result = subprocess.run([shell, '-e'], cwd=root,
                                            input=artifact_guard(), text=True,
                                            capture_output=True, timeout=10)
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertEqual(result.stdout.splitlines(), [
                        'api/compiled-binary',
                        '::error::Compiled binaries are committed. Build outputs belong in .gitignore, not in the tree.',
                    ])


if __name__ == '__main__':
    unittest.main()
