package kagi

import (
	"net/url"
	"regexp"
	"strings"
)

var tokenShape = regexp.MustCompile(`^[A-Za-z0-9._~+/=-]{16,512}$`)

// ParseLink takes what a person pastes: the Session Link (https://kagi.com/search?token=...)
// or the token alone, and returns the token.
func ParseLink(input string) (string, error) {
	input = strings.TrimSpace(input)
	if strings.Contains(input, "://") {
		u, err := url.Parse(input)
		if err != nil || (u.Hostname() != "kagi.com" && !strings.HasSuffix(u.Hostname(), ".kagi.com")) {
			return "", fail("not-kagi-link", nil)
		}
		input = u.Query().Get("token")
	}
	if !tokenShape.MatchString(input) {
		return "", fail("not-session-link", nil)
	}
	return input, nil
}
