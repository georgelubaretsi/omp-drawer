package kagi

import "testing"

func story(title, summary, link string) Story {
	s := Story{Title: title, Summary: summary}
	if link != "" {
		s.Articles = append(s.Articles, struct {
			Title  string `json:"title"`
			Link   string `json:"link"`
			Domain string `json:"domain"`
			Date   string `json:"date"`
		}{Link: link})
	}
	return s
}

// The filter matches as Kagi News' own does (kite-public, src/lib/utils/contentFilter.ts).
func TestFilterMatchesWholeWordsAsKiteDoes(t *testing.T) {
	cases := []struct {
		keywords []string
		story    Story
		hidden   bool
	}{
		{[]string{"chip"}, story("New AI chip", "", ""), true},
		{[]string{"chip"}, story("Chipotle opens", "", ""), false},
		{[]string{"u.s."}, story("", "U.S. adults agree", ""), true},
		{[]string{".net"}, story("asp.net 10 ships", "", ""), false},
		{[]string{"trump"}, story("Trumpé", "", ""), true}, // é isn't a word character to Kite.
		{[]string{"agi"}, story("A story", "Reported [agi.it#1] today", ""), false},
		{[]string{"dailymail.co.uk"}, story("A story", "", "https://news.dailymail.co.uk/x"), true},
		{[]string{"politics"}, story("Senate vote", "", ""), true}, // the preset's keywords
	}
	for _, c := range cases {
		if got := NewFilter(c.keywords, "en").Matches(&c.story); got != c.hidden {
			t.Errorf("%v on %q/%q: hidden %v, want %v", c.keywords, c.story.Title, c.story.Summary, got, c.hidden)
		}
	}
}

func TestPresetsComeInEachLanguage(t *testing.T) {
	presets := Presets()
	if len(presets) < 5 {
		t.Fatalf("%d presets", len(presets))
	}
	for _, p := range presets {
		if p.ID == "" || p.Label == "" || len(p.For("default")) == 0 {
			t.Errorf("preset %+v", p)
		}
	}
	if p := presetByID("politics"); p == nil || len(p.For("xx")) == 0 {
		t.Error("an unknown language doesn't fall back to the default keywords")
	}
}
