// Package text holds the text a native program shows people (messages, errors, output), kept in
// Markdown files: one file per output in a templates folder, its body a layout and its
// frontmatter the short texts it uses, each a template too. Templates are Go's text/template,
// filled with V; a name the values lack fails instead of printing nothing.
package text

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strings"
	"text/template"

	"go.yaml.in/yaml/v3"
)

// V are the values a template is filled with: {{.Name}} is V{"Name": ...}.
type V map[string]any

// Templates are a program's texts by name: the file's path in the folder without .md
// ("errors/not-found").
type Templates struct{ byName map[string]*Template }

// Template is one file: a body laying out one output, and short texts by dotted key
// ("parameters.query").
type Template struct {
	name  string
	body  *template.Template
	texts map[string]*template.Template
}

// funcs are what templates may call beyond text/template's own.
var funcs = template.FuncMap{"join": strings.Join}

// Load reads every .md file in fsys. A frontmatter or template that doesn't parse, or a
// frontmatter value that is neither text nor a group of texts, fails it.
func Load(fsys fs.FS) (*Templates, error) {
	t := &Templates{byName: map[string]*Template{}}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || path.Ext(p) != ".md" {
			return err
		}
		src, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		name := strings.TrimSuffix(p, ".md")
		if t.byName[name], err = parse(name, string(src)); err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		return nil
	})
	return t, err
}

// Must is Load of the folder dir in fsys, an embedded one: its files are part of the program, so
// a fault in them is the program's (every package's tests load its set).
func Must(fsys fs.FS, dir string) *Templates {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	t, err := Load(sub)
	if err != nil {
		panic(fmt.Sprintf("templates: %v", err))
	}
	return t
}

// Get is the template name; the code names only files it ships.
func (t *Templates) Get(name string) *Template {
	tpl, ok := t.byName[name]
	if !ok {
		panic(fmt.Sprintf("templates: no %s.md", name))
	}
	return tpl
}

// Names are every template's name, sorted.
func (t *Templates) Names() []string {
	names := make([]string, 0, len(t.byName))
	for n := range t.byName {
		names = append(names, n)
	}
	slices.Sort(names)
	return names
}

func parse(name, src string) (*Template, error) {
	front, body, err := Split(src)
	if err != nil {
		return nil, err
	}
	tpl := &Template{name: name, texts: map[string]*template.Template{}}
	if tpl.body, err = compile(name, strings.TrimSpace(body)); err != nil {
		return nil, err
	}
	var group map[string]any
	if err := yaml.Unmarshal([]byte(front), &group); err != nil {
		return nil, fmt.Errorf("frontmatter: %w", err)
	}
	err = tpl.addTexts(group, "")
	return tpl, err
}

// Split cuts a Markdown file into its YAML frontmatter (between --- lines at the top) and its body.
func Split(src string) (front, body string, err error) {
	rest, ok := strings.CutPrefix(src, "---\n")
	if !ok {
		return "", src, nil
	}
	front, body, ok = strings.Cut(rest, "\n---\n")
	if !ok {
		front, ok = strings.CutSuffix(rest, "\n---")
	}
	if !ok {
		return "", "", errors.New("frontmatter has no closing ---")
	}
	return front, body, nil
}

func (t *Template) addTexts(group map[string]any, prefix string) error {
	for key, value := range group {
		name := prefix + key
		switch v := value.(type) {
		case string:
			tpl, err := compile(t.name+":"+name, v)
			if err != nil {
				return err
			}
			t.texts[name] = tpl
		case map[string]any:
			if err := t.addTexts(v, name+"."); err != nil {
				return err
			}
		default:
			return fmt.Errorf("text %q is neither text nor a group of texts", name)
		}
	}
	return nil
}

func compile(name, src string) (*template.Template, error) {
	return template.New(name).Option("missingkey=error").Funcs(funcs).Parse(src)
}

// Render is the body filled with v; the newline a closing block leaves at the end is dropped.
// A name the body uses that v lacks is the program's fault, so it panics.
func (t *Template) Render(v V) string {
	return strings.TrimSuffix(fill(t.body, v), "\n")
}

// Text is the short text key filled with v; a key the file lacks panics, as does a missing name.
func (t *Template) Text(key string, v V) string {
	tpl, ok := t.texts[key]
	if !ok {
		panic(fmt.Sprintf("templates: %s.md has no text %q", t.name, key))
	}
	return fill(tpl, v)
}

// Keys are the short texts' keys under group ("parameters"), without the group, sorted.
func (t *Template) Keys(group string) []string {
	var keys []string
	for k := range t.texts {
		if rest, ok := strings.CutPrefix(k, group+"."); ok {
			keys = append(keys, rest)
		}
	}
	slices.Sort(keys)
	return keys
}

func fill(tpl *template.Template, v V) string {
	if v == nil {
		v = V{}
	}
	var b bytes.Buffer
	if err := tpl.Execute(&b, v); err != nil {
		panic(fmt.Sprintf("templates: %v", err))
	}
	return b.String()
}

// Err is an error whose text is the body filled with v.
func (t *Template) Err(v V) error { return errors.New(t.Render(v)) }

// Wrap is an error whose text is the body filled with v and the cause as .Cause, and which
// wraps the cause (errors.Is sees through it).
func (t *Template) Wrap(cause error, v V) error {
	all := V{"Cause": cause}
	for k, x := range v {
		all[k] = x
	}
	return &wrapped{t.Render(all), cause}
}

type wrapped struct {
	msg   string
	cause error
}

func (w *wrapped) Error() string { return w.msg }
func (w *wrapped) Unwrap() error { return w.cause }
