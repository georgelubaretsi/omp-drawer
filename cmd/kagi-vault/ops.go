package main

// The vault's operations (core/operations.json, each `vault: true`): their inputs as the plugin's
// shells send them, checked here, and their outputs as JSON. Arrays go out in an object, so every
// output is one.

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"piebird.dev/plugins/internal/kagi"
	"piebird.dev/plugins/internal/ops"
)

func (v *vault) ops() map[string]ops.Op {
	return map[string]ops.Op{
		"search":              op(v.search),
		"batch-search":        op(v.batch),
		"quick":               op(v.quick),
		"status":              op(func(ctx context.Context, _ *struct{}) (status, error) { return v.status(ctx) }),
		"news-search":         op(v.newsSearch),
		"news":                op(v.news),
		"news-categories":     op(v.categories),
		"news-chaos":          op(v.chaos),
		"news-filter-presets": op(presets),
		"smallweb":            op(v.smallweb),
		"raw-read":            op(v.rawRead),
		"raw-write":           op(v.rawWrite),
	}
}

// op is the operation fn of the decoded input.
func op[In, Out any](fn func(context.Context, *In) (Out, error)) ops.Op {
	return func(ctx context.Context, raw json.RawMessage) (any, error) {
		var in In
		if err := ops.Decode(raw, &in); err != nil {
			return nil, err
		}
		return fn(ctx, &in)
	}
}

// filters are what a web search can narrow by.
type filters struct {
	Time     string `json:"time"`
	FromDate string `json:"from_date"`
	ToDate   string `json:"to_date"`
	Limit    int    `json:"limit"`
}

func (f *filters) query(text string) kagi.Query {
	return kagi.Query{Text: text, Time: f.Time, From: f.FromDate, To: f.ToDate, Limit: f.Limit}
}

type searchInput struct {
	Query string `json:"query"`
	filters
}

// found is a search's results.
type found[R any] struct {
	Results []R `json:"results"`
}

func (v *vault) search(ctx context.Context, in *searchInput) (found[kagi.Result], error) {
	return withSession(ctx, v, func(c *kagi.Client) (found[kagi.Result], error) {
		r, err := c.Search(ctx, in.query(in.Query))
		return found[kagi.Result]{nonNil(r)}, err
	})
}

type batchInput struct {
	Queries []string `json:"queries"`
	filters
}

// batchResult is one query's results in a batch.
type batchResult struct {
	Query   string        `json:"query"`
	Results []kagi.Result `json:"results"`
}

type batches struct {
	Batches []batchResult `json:"batches"`
}

// batch runs the queries three at a time. A query's failure is the batch's, with the query among
// its values; a sign-in the batch needs is asked for once.
func (v *vault) batch(ctx context.Context, in *batchInput) (batches, error) {
	if len(in.Queries) < 1 || len(in.Queries) > 10 {
		return batches{}, ops.Fail("queries", map[string]any{"got": len(in.Queries)})
	}
	return withSession(ctx, v, func(c *kagi.Client) (batches, error) {
		out := make([]batchResult, len(in.Queries))
		errs := make([]error, len(in.Queries))
		var wg sync.WaitGroup
		slots := make(chan struct{}, 3)
		for i, q := range in.Queries {
			wg.Go(func() {
				slots <- struct{}{}
				defer func() { <-slots }()
				r, err := c.Search(ctx, in.query(q))
				out[i], errs[i] = batchResult{q, nonNil(r)}, err
			})
		}
		wg.Wait()
		for i, err := range errs {
			if err != nil {
				return batches{}, forQuery(err, in.Queries[i])
			}
		}
		return batches{out}, nil
	})
}

// forQuery is a batch query's error with the query among its values; a sign-in error stays as it
// is, for withSession to see.
func forQuery(err error, query string) error {
	declared := new(ops.Error)
	if errors.Is(err, kagi.ErrSignIn) || !errors.As(err, &declared) {
		return err
	}
	vars := map[string]any{"query": query}
	for k, val := range declared.Variables {
		vars[k] = val
	}
	return ops.Fail(declared.ID, vars)
}

type queryInput struct {
	Query string `json:"query"`
}

func (v *vault) quick(ctx context.Context, in *queryInput) (kagi.Answer, error) {
	return withSession(ctx, v, func(c *kagi.Client) (kagi.Answer, error) { return c.Quick(ctx, in.Query) })
}

type newsSearchInput struct {
	Query     string `json:"query"`
	Freshness string `json:"freshness"`
	Limit     int    `json:"limit"`
}

func (v *vault) newsSearch(ctx context.Context, in *newsSearchInput) (found[kagi.NewsResult], error) {
	limit, err := limitOf(in.Limit)
	if err != nil {
		return found[kagi.NewsResult]{}, err
	}
	return withSession(ctx, v, func(c *kagi.Client) (found[kagi.NewsResult], error) {
		r, err := c.NewsSearch(ctx, in.Query, in.Freshness, limit)
		return found[kagi.NewsResult]{nonNil(r)}, err
	})
}

type newsInput struct {
	Category string   `json:"category"`
	Lang     string   `json:"lang"`
	Limit    int      `json:"limit"`
	Hide     []string `json:"hide"`
}

type stories struct {
	Stories []kagi.Story `json:"stories"`
}

func (v *vault) news(ctx context.Context, in *newsInput) (stories, error) {
	limit, err := limitOf(in.Limit)
	if err != nil {
		return stories{}, err
	}
	lang := or(in.Lang, "en")
	s, err := v.public().News(ctx, kagi.NewsQuery{
		Category: or(in.Category, "world"), Lang: lang, Limit: limit, Hide: kagi.NewFilter(in.Hide, lang),
	})
	return stories{nonNil(s)}, err
}

type langInput struct {
	Lang string `json:"lang"`
}

type categories struct {
	Categories []kagi.Category `json:"categories"`
}

func (v *vault) categories(ctx context.Context, in *langInput) (categories, error) {
	c, err := v.public().Categories(ctx, or(in.Lang, "en"))
	return categories{nonNil(c)}, err
}

func (v *vault) chaos(ctx context.Context, in *langInput) (kagi.Chaos, error) {
	return v.public().Chaos(ctx, or(in.Lang, "en"))
}

type presetList struct {
	Presets []kagi.LocalPreset `json:"presets"`
}

func presets(_ context.Context, in *langInput) (presetList, error) {
	return presetList{nonNil(kagi.PresetsIn(or(in.Lang, "en")))}, nil
}

type limitInput struct {
	Limit int `json:"limit"`
}

type posts struct {
	Posts []kagi.Post `json:"posts"`
}

func (v *vault) smallweb(ctx context.Context, in *limitInput) (posts, error) {
	limit, err := limitOf(in.Limit)
	if err != nil {
		return posts{}, err
	}
	p, err := v.public().SmallWeb(ctx, limit)
	return posts{nonNil(p)}, err
}

// limitOf is a limit as given, 10 when none is, or the declared error limit when it isn't 1 to 50.
func limitOf(limit int) (int, error) {
	limit = or(limit, 10)
	if limit < 1 || limit > 50 {
		return 0, ops.Fail("limit", nil)
	}
	return limit, nil
}

// or is value, or fallback when value is empty or zero.
func or[V comparable](value, fallback V) V {
	var zero V
	if value == zero {
		return fallback
	}
	return value
}

// nonNil is s, or an empty slice for none, so the output has [] rather than null.
func nonNil[S ~[]E, E any](s S) S {
	if s == nil {
		return S{}
	}
	return s
}
