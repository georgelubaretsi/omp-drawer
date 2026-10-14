package chrome

import (
	"testing"
	"time"
)

// Sec-CH-UA as released Chrome versions sent it.
func TestBrandsMatchRealChrome(t *testing.T) {
	cases := map[int]string{
		120: `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`,
		130: `"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"`,
		131: `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
		138: `"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"`,
		141: `"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"`,
	}
	for major, want := range cases {
		if got := Brands(major); got != want {
			t.Errorf("Chrome %d: %s, want %s", major, got, want)
		}
	}
}

func TestHeadersPerSystem(t *testing.T) {
	cases := map[string][2]string{
		"darwin":  {"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36", `"macOS"`},
		"windows": {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36", `"Windows"`},
		"linux":   {"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36", `"Linux"`},
	}
	for goos, want := range cases {
		h := For(154, goos)
		if h.Get("User-Agent") != want[0] || h.Get("Sec-CH-UA-Platform") != want[1] || h.Get("Sec-CH-UA-Mobile") != "?0" {
			t.Errorf("%s: %v", goos, h)
		}
	}
}

func TestMajorOfVersionStrings(t *testing.T) {
	for in, want := range map[string]int{
		"154.0.8037.58":                  154,
		"Google Chrome 153.0.7999.12 \n": 153,
		"chrome_proxy.exe":               0,
		"":                               0,
	} {
		if got := majorOf(in); got != want {
			t.Errorf("majorOf(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestEstimateFollowsTheReleaseCycle(t *testing.T) {
	if got := estimate(knownRelease.Add(-time.Hour)); got != knownMajor {
		t.Errorf("before the known release: %d", got)
	}
	if got := estimate(knownRelease.AddDate(0, 0, 57)); got != knownMajor+2 {
		t.Errorf("eight weeks on: %d", got)
	}
}
