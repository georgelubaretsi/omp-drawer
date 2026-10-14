package kagi

import "testing"

func TestParseLink(t *testing.T) {
	good := map[string]string{
		"https://kagi.com/search?token=abcDEF123456_-.xyz789&q=%s": "abcDEF123456_-.xyz789",
		"  abcDEF123456_-.xyz789  ":                                "abcDEF123456_-.xyz789",
	}
	for in, want := range good {
		if got, err := ParseLink(in); err != nil || got != want {
			t.Errorf("ParseLink(%q) = %q, %v", in, got, err)
		}
	}
	for _, in := range []string{"https://evil.example/search?token=abcDEF123456789", "https://kagi.com/search?q=x", "short", "has spaces in it ok"} { // gitleaks:allow: made-up tokens
		if _, err := ParseLink(in); err == nil {
			t.Errorf("ParseLink(%q) accepted", in)
		}
	}
}
