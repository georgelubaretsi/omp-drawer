import { describe, expect, test } from "bun:test";
import { newestFirst } from "./system";

describe("Claude's older Windows installer", () => {
	test("its app folders newest first by version, not by spelling", () => {
		expect(newestFirst(["app-1.9.0", "packages", "app-1.10.0", "app-1.10", "app-0.12.3"])).toEqual([
			"app-1.10.0",
			"app-1.10",
			"app-1.9.0",
			"app-0.12.3",
		]);
	});
});
