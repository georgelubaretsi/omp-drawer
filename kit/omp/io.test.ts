import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { ompPlace } from "./io";

describe("ompPlace", () => {
	test("is the person's home, the session's folder and the plugin's folder", () => {
		expect(ompPlace({ cwd: "/work/repo" }, "/plugins/demo/src/..")).toEqual({
			home: homedir(),
			project: "/work/repo",
			plugin: "/plugins/demo",
		});
	});
});
