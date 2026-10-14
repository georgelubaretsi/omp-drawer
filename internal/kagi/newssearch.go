package kagi

import (
	"context"
	"encoding/xml"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// NewsResult is one article from the News tab.
type NewsResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Source  string `json:"source,omitempty"`
	Snippet string `json:"snippet,omitempty"`
	// Age is Kagi's own words for when it was published ("3 hours ago").
	Age string `json:"age,omitempty"`
}

var freshness = []string{"day", "week", "month"}

// NewsSearch searches the News tab of kagi.com; fresh is day, week or month, or empty for any.
func (c *Client) NewsSearch(ctx context.Context, query, fresh string, limit int) ([]NewsResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errEmptyQuery
	}
	params := url.Values{"q": {query}}
	if fresh != "" {
		if !slices.Contains(freshness, fresh) {
			return nil, oneOf("freshness", freshness, fresh)
		}
		params.Set("freshness", fresh)
	}
	body, err := c.page(ctx, "/news", params)
	if err != nil {
		return nil, err
	}
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return nil, failReading("news-page", err)
	}
	results := parseNews(doc)
	return results[:min(limit, len(results))], nil
}

// parseNews reads each .newsResultItem of the News tab, once per URL, in page order.
func parseNews(doc *html.Node) []NewsResult {
	var out []NewsResult
	seen := map[string]bool{}
	each(doc, classed("newsResultItem"), func(n *html.Node) {
		link := find(n, classed("_0_TITLE"))
		for link != nil && link.Data != "a" {
			link = link.Parent
		}
		if link == nil {
			return
		}
		r := NewsResult{
			Title:   nodeText(link, classed("__domain-name")),
			URL:     strings.TrimSpace(attr(link, "href")),
			Source:  attr(link, "data-domain"),
			Snippet: nodeText(find(n, classed("newsResultContent")), nil),
			Age:     nodeText(find(n, classed("newsResultTime")), nil),
		}
		if r.Title != "" && strings.HasPrefix(r.URL, "http") && !seen[r.URL] {
			seen[r.URL] = true
			out = append(out, r)
		}
	})
	return out
}

// Post is one entry of the Small Web feed.
type Post struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Author    string `json:"author,omitempty"`
	Published string `json:"published,omitempty"`
}

// SmallWeb is the newest posts of Kagi's Small Web feed: personal sites and blogs.
func (c *Client) SmallWeb(ctx context.Context, limit int) ([]Post, error) {
	body, err := c.public(ctx, c.Base, "/api/v1/smallweb/feed/", url.Values{"limit": {strconv.Itoa(limit)}})
	if err != nil {
		return nil, err
	}
	var feed struct {
		Entries []struct {
			Title string `xml:"title"`
			Link  []struct {
				Href string `xml:"href,attr"`
				Rel  string `xml:"rel,attr"`
			} `xml:"link"`
			Author    string `xml:"author>name"`
			Published string `xml:"published"`
		} `xml:"entry"`
	}
	if err := xml.Unmarshal([]byte(body), &feed); err != nil {
		return nil, failReading("smallweb", err)
	}
	var posts []Post
	for _, e := range feed.Entries {
		p := Post{Title: strings.TrimSpace(e.Title), Author: e.Author, Published: day(e.Published)}
		for _, l := range e.Link {
			if l.Rel == "" || l.Rel == "alternate" {
				p.URL = l.Href
			}
		}
		if len(posts) < limit {
			posts = append(posts, p)
		}
	}
	return posts, nil
}

// day is an RFC 3339 time's date, YYYY-MM-DD; anything else as it is.
func day(stamp string) string {
	if t, err := time.Parse(time.RFC3339, strings.TrimSpace(stamp)); err == nil {
		return t.Format(time.DateOnly)
	}
	return stamp
}
