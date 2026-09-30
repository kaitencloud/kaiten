package atomicfile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteReplacesContentAndMode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret")
	require.NoError(t, os.WriteFile(path, []byte("old"), 0o644))

	require.NoError(t, Write(path, []byte("new"), 0o600))

	content, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, "new", string(content))

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())
}
