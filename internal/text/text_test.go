package text

import (
	"errors"
	"io/fs"
	"strings"
	"testing"
	"testing/fstest"
)

func load(t *testing.T, files map[string]string) (*Templates, error) {
	t.Helper()
	fsys := fstest.MapFS{}
	for name, src := range files {
		fsys[name] = &fstest.MapFile{Data: []byte(src)}
	}
	return Load(fsys)
}

func mustPanic(t *testing.T, what string, f func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Errorf("%s: no panic", what)
		}
	}()
	f()
}

func TestBodyAndTextsAreFilledFromValues(t *testing.T) {
	tpls, err := load(t, map[string]string{
		"tools/search.md": "---\nparameters:\n  query: What to find\n  nested:\n    deep: \"{{.N}} deep\"\n---\n\nSearch {{.Where}}.\n\n",
		"list.md":         "{{range .Items}}- {{.}}\n{{end}}",
		"other.txt":       "not a template",
	})
	if err != nil {
		t.Fatal(err)
	}
	s := tpls.Get("tools/search")
	if got := s.Render(V{"Where": "the web"}); got != "Search the web." {
		t.Errorf("body %q", got)
	}
	if got := s.Text("parameters.query", nil); got != "What to find" {
		t.Errorf("text %q", got)
	}
	if got := s.Text("parameters.nested.deep", V{"N": 2}); got != "2 deep" {
		t.Errorf("nested text %q", got)
	}
	if got := s.Keys("parameters"); strings.Join(got, ",") != "nested.deep,query" {
		t.Errorf("keys %v", got)
	}
	if got := tpls.Get("list").Render(V{"Items": []string{"a", "b"}}); got != "- a\n- b" {
		t.Errorf("a closing block's last newline stays: %q", got)
	}
	if strings.Join(tpls.Names(), ",") != "list,tools/search" {
		t.Errorf("names %v", tpls.Names())
	}
}

func TestMissingNamesFailLoudly(t *testing.T) {
	tpls, err := load(t, map[string]string{"a.md": "---\nx: \"{{.Y}}\"\n---\n{{.Name}} {{.Item.Field}}"})
	if err != nil {
		t.Fatal(err)
	}
	a := tpls.Get("a")
	mustPanic(t, "a value the body uses is missing", func() { a.Render(V{"Item": struct{ Field int }{}}) })
	mustPanic(t, "a struct lacks the field", func() { a.Render(V{"Name": "n", "Item": struct{ Other int }{}}) })
	mustPanic(t, "a text the code names is missing", func() { a.Text("z", nil) })
	mustPanic(t, "a value a text uses is missing", func() { a.Text("x", nil) })
	mustPanic(t, "a template the code names is missing", func() { tpls.Get("b") })
}

func TestBadFilesFailToLoad(t *testing.T) {
	for name, src := range map[string]string{
		"a number in the frontmatter": "---\nx: 3\n---\nbody",
		"a list in the frontmatter":   "---\nx: [a]\n---\nbody",
		"no closing line":             "---\nx: y\nbody",
		"a broken template":           "{{.X",
		"a broken text":               "---\nx: \"{{if}}\"\n---\nbody",
	} {
		if _, err := load(t, map[string]string{"a.md": src}); err == nil {
			t.Errorf("%s: loaded", name)
		}
	}
	if _, err := Load(fstest.MapFS{"a.md": {Mode: fs.ModeDir}}); err != nil {
		t.Errorf("a folder named .md: %v", err)
	}
}

func TestErrorsWrapTheirCause(t *testing.T) {
	tpls, err := load(t, map[string]string{"e.md": "cannot reach {{.Host}}: {{.Cause}}", "f.md": "plain"})
	if err != nil {
		t.Fatal(err)
	}
	cause := errors.New("timeout")
	err = tpls.Get("e").Wrap(cause, V{"Host": "kagi.com"})
	if err.Error() != "cannot reach kagi.com: timeout" || !errors.Is(err, cause) {
		t.Errorf("wrapped: %v", err)
	}
	if err := tpls.Get("f").Err(nil); err.Error() != "plain" {
		t.Errorf("plain: %v", err)
	}
}
