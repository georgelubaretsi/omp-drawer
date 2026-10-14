// Package texttest checks a package's templates in its tests: each one rendered with the values
// its code passes, so a template added without a case, a case left for a removed template, or a
// template naming a value the code lacks fails the test.
package texttest

import (
	"slices"
	"testing"

	"piebird.dev/plugins/internal/text"
)

// Every renders each template in tpls with its case.
func Every(t *testing.T, tpls *text.Templates, cases map[string]text.V) {
	t.Helper()
	names := tpls.Names()
	for _, name := range names {
		v, ok := cases[name]
		if !ok {
			t.Errorf("templates/%s.md has no case", name)
			continue
		}
		func() {
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("templates/%s.md: %v", name, r)
				}
			}()
			_ = tpls.Get(name).Render(v)
		}()
	}
	for name := range cases {
		if !slices.Contains(names, name) {
			t.Errorf("a case for templates/%s.md, which doesn't exist", name)
		}
	}
}
