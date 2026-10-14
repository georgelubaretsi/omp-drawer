// Finding the login name in what a recording shows: as a word of its own, wherever it stands.
import { expect, test } from "bun:test";
import { shows } from "./onscreen";

test("the name as a word: in ls -l's owner column, in a path, in any case", () => {
	expect(shows("drwxr-xr-x@ 5 ada  wheel  160 Oct 14 09:39 src", "ada")).toBe(true);
	expect(shows("/Users/ada/devel/shop", "ada")).toBe(true);
	expect(shows("Signed in as ADA.", "ada")).toBe(true);
});

test("not inside another word or number", () => {
	expect(shows("Canada and adapters", "ada")).toBe(false);
	expect(shows("ada2 ada_x 1ada", "ada")).toBe(false);
});

test("a name with characters a pattern would read otherwise is matched as written", () => {
	expect(shows("owner: j.doe", "j.doe")).toBe(true);
	expect(shows("owner: jxdoe", "j.doe")).toBe(false);
});
