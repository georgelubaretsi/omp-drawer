package kagi

import (
	_ "embed"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

// contentfilters.json is Kagi News' own preset list (contentfilters.NOTICE.md).
//
//go:embed contentfilters.json
var presetsJSON []byte

// Preset is one of Kagi News' content-filter presets: a topic and its keywords per language.
type Preset struct {
	ID       string              `json:"id"`
	Label    string              `json:"label"`
	Keywords map[string][]string `json:"keywords"`
}

// Presets are Kagi News' content-filter presets.
func Presets() []Preset {
	var f struct {
		Filters []Preset `json:"filters"`
	}
	_ = json.Unmarshal(presetsJSON, &f) // Embedded and covered by a test.
	return f.Filters
}

// For is the preset's keywords in lang, or its default ones.
func (p Preset) For(lang string) []string {
	if k, ok := p.Keywords[lang]; ok {
		return k
	}
	return p.Keywords["default"]
}

// LocalPreset is a preset with its keywords in one language.
type LocalPreset struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Keywords []string `json:"keywords"`
}

// PresetsIn is every preset with its keywords in lang.
func PresetsIn(lang string) []LocalPreset {
	presets := Presets()
	out := make([]LocalPreset, len(presets))
	for i, p := range presets {
		out[i] = LocalPreset{ID: p.ID, Label: p.Label, Keywords: p.For(lang)}
	}
	return out
}

// Filter hides stories by keyword, as Kagi News' own content filter does: whole words in a
// story's title, category and summary; a hostname-shaped keyword (dailymail.co.uk) by source.
type Filter struct{ keywords []string }

// NewFilter takes preset ids and plain keywords alike: an entry naming a preset brings its
// keywords in lang.
func NewFilter(entries []string, lang string) Filter {
	var f Filter
	for _, e := range entries {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" {
			continue
		}
		if p := presetByID(e); p != nil {
			for _, k := range p.For(lang) {
				f.keywords = append(f.keywords, strings.ToLower(k))
			}
			continue
		}
		f.keywords = append(f.keywords, e)
	}
	return f
}

func presetByID(id string) *Preset {
	for _, p := range Presets() {
		if p.ID == id {
			return &p
		}
	}
	return nil
}

var (
	hostKeyword = regexp.MustCompile(`^[a-z0-9-]+(?:\.[a-z0-9-]+)+$`)
	// citation markers such as [agi.it#1] name a source, not what the story says; a summary
	// shown without them loses the space before each too.
	citation = regexp.MustCompile(`\s*\[[^\]\s]+#\d+\]`)
)

// Matches reports whether the filter hides s.
func (f Filter) Matches(s *Story) bool {
	if len(f.keywords) == 0 {
		return false
	}
	content := strings.ToLower(citation.ReplaceAllString(s.Title+" "+s.Category+" "+s.Summary, " "))
	for _, k := range f.keywords {
		if wholeWord(content, k) || hostKeyword.MatchString(k) && fromHost(s, k) {
			return true
		}
	}
	return false
}

func fromHost(s *Story, keyword string) bool {
	keyword = strings.TrimPrefix(keyword, "www.")
	for _, a := range s.Articles {
		hosts := []string{a.Domain}
		if u, err := url.Parse(a.Link); err == nil {
			hosts = append(hosts, u.Hostname())
		}
		for _, h := range hosts {
			h = strings.TrimPrefix(strings.ToLower(h), "www.")
			if h == keyword || strings.HasSuffix(h, "."+keyword) {
				return true
			}
		}
	}
	return false
}

// wholeWord reports whether k occurs in text between non-word characters (or the text's ends),
// as Kite's regular expression has it: \w is ASCII letters, digits and _, so any other character,
// accented letters included, ends a word.
func wholeWord(text, k string) bool {
	for from := 0; ; {
		i := strings.Index(text[from:], k)
		if i < 0 {
			return false
		}
		start, end := from+i, from+i+len(k)
		if !wordAt(text, start-1) && !wordAt(text, end) {
			return true
		}
		from = start + 1
	}
}

func wordAt(text string, at int) bool {
	if at < 0 || at >= len(text) {
		return false
	}
	b := text[at]
	return b == '_' || b >= '0' && b <= '9' || b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z'
}
