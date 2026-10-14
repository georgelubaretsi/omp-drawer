// The made-up project the demos work in: a small web shop API, path → text. Its cart has a known
// kind of bug, money subtracted without a floor at zero, in two places (total and shipping).

const README = `# shop-api

A small HTTP API for a web shop: carts, orders and payments.

## Run

    bun run src/server.ts

## Test

    bun test
`;

const CART = `export interface Line {
	price: number;
	qty: number;
}

export function subtotal(lines: Line[]): number {
	return lines.reduce((sum, line) => sum + line.price * line.qty, 0);
}

/** What the customer pays for the items, after a gift card. */
export function total(lines: Line[], giftCard: number): number {
	return subtotal(lines) - giftCard;
}

/** Shipping, after a shipping coupon. */
export function shipping(base: number, coupon: number): number {
	return base - coupon;
}
`;

const CART_TEST = `import { expect, test } from "bun:test";
import { shipping, subtotal, total } from "./cart";

const lines = [{ price: 12, qty: 2 }, { price: 5, qty: 1 }];

test("subtotal adds every line", () => expect(subtotal(lines)).toBe(29));
test("a gift card lowers the total", () => expect(total(lines, 10)).toBe(19));
test("a coupon lowers shipping", () => expect(shipping(6, 2)).toBe(4));
`;

const SERVER = `import { total } from "./cart";

export const port = 8080;

Bun.serve({ port, fetch: () => Response.json({ total: total([], 0) }) });
`;

const CHANGELOG = `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).

## [Unreleased]

### Added

- Shipping coupons.
`;

export const shopApi: Record<string, string> = {
	"README.md": README,
	"CHANGELOG.md": CHANGELOG,
	"package.json": '{ "name": "shop-api", "private": true, "type": "module" }\n',
	"src/cart.ts": CART,
	"src/cart.test.ts": CART_TEST,
	"src/server.ts": SERVER,
};
