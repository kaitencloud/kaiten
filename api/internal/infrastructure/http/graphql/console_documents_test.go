package graphql

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/lexer"
	"github.com/vektah/gqlparser/v2/parser"
)

// consoleSource is the console's source tree, from this package's directory.
var consoleSource = filepath.Join("..", "..", "..", "..", "..", "app", "src")

// consoleDocument is a GraphQL document the way the console writes one: the
// template literal it hands to graphql(), which is what its codegen reads.
var consoleDocument = regexp.MustCompile("(?s)graphql\\(\\s*`(.*?)`\\s*,?\\s*\\)")

// TestLegitimateQueriesHoldEveryConsoleDocument keeps the console's copies in
// legitimateQueries verbatim, so that the costs pinned against them are the
// costs of what the console sends.
func TestLegitimateQueriesHoldEveryConsoleDocument(t *testing.T) {
	t.Parallel()

	documents := consoleDocuments(t)
	require.NotEmpty(t, documents, "no GraphQL document found under %s", consoleSource)

	for name, document := range documents {
		copied, held := legitimateQueries[name]
		require.True(t, held, "the console holds %s: copy it into legitimateQueries", name)
		require.Equal(t, graphQLTokens(t, document), graphQLTokens(t, copied),
			"the console changed %s: copy it again, and read the pins against it", name)
	}

	for name := range legitimateQueries {
		if strings.HasPrefix(name, "console/") {
			require.Contains(t, documents, name, "the console no longer holds %s", name)
		}
	}
}

// consoleDocuments reads what the console's codegen reads (app/codegen.ts):
// every .ts and .tsx file under app/src. Its output, src/api-client, is
// skipped.
func consoleDocuments(t *testing.T) map[string]string {
	t.Helper()

	root, err := os.OpenRoot(consoleSource)
	require.NoError(t, err)
	defer func() { require.NoError(t, root.Close()) }()

	sources := root.FS()
	documents := map[string]string{}
	err = fs.WalkDir(sources, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if entry.Name() == "api-client" {
				return fs.SkipDir
			}
			return nil
		}
		if ext := filepath.Ext(path); ext != ".ts" && ext != ".tsx" {
			return nil
		}

		source, err := fs.ReadFile(sources, path)
		if err != nil {
			return err
		}
		for _, match := range consoleDocument.FindAllSubmatch(source, -1) {
			doc, err := parser.ParseQuery(&ast.Source{Input: string(match[1])})
			require.NoError(t, err, path)
			require.Len(t, doc.Operations, 1, path)

			name := "console/" + doc.Operations[0].Name
			require.NotContains(t, documents, name, "two documents named %s", name)
			documents[name] = string(match[1])
		}

		return nil
	})
	require.NoError(t, err)

	return documents
}

// graphQLTokens is a document as GraphQL reads it, without the whitespace,
// commas and comments it ignores.
func graphQLTokens(t *testing.T, document string) []string {
	t.Helper()

	var tokens []string
	l := lexer.New(&ast.Source{Input: document})
	for {
		token, err := l.ReadToken()
		require.NoError(t, err)

		switch token.Kind {
		case lexer.EOF:
			return tokens
		case lexer.Comment:
			continue
		default:
			tokens = append(tokens, token.String())
		}
	}
}
