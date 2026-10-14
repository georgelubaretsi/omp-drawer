// Where a demo finds Kagi's session on this Mac: the token, whichever form the kagi CLI keeps it in.
import { expect, test } from "bun:test";
import { kagiToken } from "./credentials";

const cli = (sessionToken: string) => `[auth]\nsession_token = ${JSON.stringify(sessionToken)}\n`;

test("the kagi CLI's session_token, a bare token or the whole Session Link, gives the token", () => {
	expect(kagiToken({}, cli("abc.DEF-123"))).toBe("abc.DEF-123");
	expect(kagiToken({}, cli("https://kagi.com/search?token=abc.DEF-123"))).toBe("abc.DEF-123");
	expect(kagiToken({}, cli("https://kagi.com/search?q=x&token=a%2Fb%2Bc"))).toBe("a/b+c");
});

test("KAGI_SESSION_TOKEN comes first, in either form", () => {
	const config = cli("from-the-cli");
	expect(kagiToken({ KAGI_SESSION_TOKEN: "from-env" }, config)).toBe("from-env");
	expect(kagiToken({ KAGI_SESSION_TOKEN: "https://kagi.com/search?token=from-env" }, config)).toBe("from-env");
});

test("no token anywhere, or a link without one, is none", () => {
	expect(kagiToken({})).toBeUndefined();
	expect(kagiToken({}, "[auth]\n")).toBeUndefined();
	expect(kagiToken({}, cli("  "))).toBeUndefined();
	expect(kagiToken({}, cli("https://kagi.com/search?q=x"))).toBeUndefined();
});
