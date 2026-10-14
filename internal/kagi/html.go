package kagi

import (
	"slices"
	"strings"

	"golang.org/x/net/html"
)

// hasClass reports whether n is an element with every class in classes.
func hasClass(n *html.Node, classes ...string) bool {
	if n.Type != html.ElementNode {
		return false
	}
	var have []string
	for _, a := range n.Attr {
		if a.Key == "class" {
			have = strings.Fields(a.Val)
		}
	}
	for _, c := range classes {
		if !slices.Contains(have, c) {
			return false
		}
	}
	return true
}

func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}

// find is the first node under n (n included) that match accepts, in document order.
func find(n *html.Node, match func(*html.Node) bool) *html.Node {
	if match(n) {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if f := find(c, match); f != nil {
			return f
		}
	}
	return nil
}

// each calls fn on every node under n that match accepts, without looking inside a match.
func each(n *html.Node, match func(*html.Node) bool, fn func(*html.Node)) {
	if match(n) {
		fn(n)
		return
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		each(c, match, fn)
	}
}

func classed(classes ...string) func(*html.Node) bool {
	return func(n *html.Node) bool { return hasClass(n, classes...) }
}

// nodeText is n's text with whitespace collapsed, leaving out the subtrees skip accepts.
func nodeText(n *html.Node, skip func(*html.Node) bool) string {
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if skip != nil && skip(n) {
			return
		}
		if n.Type == html.TextNode {
			b.WriteString(n.Data)
			b.WriteByte(' ')
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	if n != nil {
		walk(n)
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
