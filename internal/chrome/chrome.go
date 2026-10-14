// Package chrome describes requests as the Chrome installed on this computer sends them: its
// User-Agent and its default client hints (Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform), so a
// site serves a plugin what it serves the person's own browser.
package chrome

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Without Chrome installed, the major version is estimated from Chrome's four-week release
// cycle, counted from a known release.
var (
	knownMajor   = 154
	knownRelease = time.Date(2026, time.October, 6, 0, 0, 0, 0, time.UTC)
)

var (
	once    sync.Once
	headers http.Header
)

// Headers are the User-Agent and client hints of this computer's Chrome, found once per process.
func Headers() http.Header {
	once.Do(func() { headers = For(installedMajor(), runtime.GOOS) })
	return headers.Clone()
}

// For is what Chrome of major version major sends on goos.
func For(major int, goos string) http.Header {
	system, platform := "X11; Linux x86_64", "Linux"
	switch goos {
	case "darwin":
		system, platform = "Macintosh; Intel Mac OS X 10_15_7", "macOS"
	case "windows":
		system, platform = "Windows NT 10.0; Win64; x64", "Windows"
	}
	h := http.Header{}
	h.Set("User-Agent", fmt.Sprintf("Mozilla/5.0 (%s) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%d.0.0.0 Safari/537.36", system, major))
	h.Set("Sec-CH-UA", Brands(major))
	h.Set("Sec-CH-UA-Mobile", "?0")
	h.Set("Sec-CH-UA-Platform", strconv.Quote(platform))
	return h
}

// Brands is Chrome's Sec-CH-UA for major: its two brands and a "greased" made-up one, in the
// order Chromium derives from the version (components/embedder_support/user_agent_utils.cc).
func Brands(major int) string {
	chars := []string{" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"}
	versions := []string{"8", "99", "24"}
	orders := [][3]int{{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}}
	v := strconv.Itoa(major)
	grease := "Not" + chars[major%len(chars)] + "A" + chars[(major+1)%len(chars)] + "Brand"
	brands := [3]string{brand(grease, versions[major%len(versions)]), brand("Chromium", v), brand("Google Chrome", v)}
	var out [3]string
	for i, at := range orders[major%len(orders)] {
		out[at] = brands[i]
	}
	return strings.Join(out[:], ", ")
}

// brand is one entry of Sec-CH-UA: the name and the version, each in double quotes.
func brand(name, version string) string {
	return `"` + name + `";v="` + version + `"`
}

// installedMajor is the installed Chrome's major version, or the estimate.
func installedMajor() int {
	if v := majorOf(installedVersion()); v > 0 {
		return v
	}
	return estimate(time.Now())
}

func estimate(now time.Time) int {
	return knownMajor + max(0, int(now.Sub(knownRelease)/(28*24*time.Hour)))
}

var leadingMajor = regexp.MustCompile(`(\d{2,4})\.\d+\.\d+\.\d+`)

func majorOf(version string) int {
	m := leadingMajor.FindStringSubmatch(version)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

func installedVersion() string {
	switch runtime.GOOS {
	case "darwin":
		return macVersion()
	case "windows":
		return windowsVersion()
	}
	return linuxVersion()
}

var plistVersion = regexp.MustCompile(`<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>`)

func macVersion() string {
	home, _ := os.UserHomeDir()
	for _, app := range []string{"/Applications", filepath.Join(home, "Applications")} {
		b, err := os.ReadFile(filepath.Join(app, "Google Chrome.app", "Contents", "Info.plist"))
		if m := plistVersion.FindSubmatch(b); err == nil && m != nil {
			return string(m[1])
		}
	}
	return ""
}

// windowsVersion reads the version folders Chrome keeps beside chrome.exe, newest first.
func windowsVersion() string {
	best := ""
	for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)", "LocalAppData"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		entries, _ := os.ReadDir(filepath.Join(base, "Google", "Chrome", "Application"))
		for _, e := range entries {
			if e.IsDir() && majorOf(e.Name()) > majorOf(best) {
				best = e.Name()
			}
		}
	}
	return best
}

func linuxVersion() string {
	for _, bin := range []string{"google-chrome", "google-chrome-stable", "/opt/google/chrome/chrome"} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		out, err := exec.CommandContext(ctx, bin, "--version").Output()
		cancel()
		if err == nil {
			return string(out)
		}
	}
	return ""
}
