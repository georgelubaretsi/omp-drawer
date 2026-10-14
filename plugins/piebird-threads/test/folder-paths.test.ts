import type { Io } from "../kit/core/io";
import { describe, expect, test } from "bun:test";
import { resolvePath, threadsFolder } from "../core/folder";

describe("a threads folder's path", () => {
	test("keeps each kind of root, which `..` never leaves", () => {
		const cases: [string, string, string][] = [
			["/home/ada/shop", "notes/threads", "/home/ada/shop/notes/threads"],
			["/home/ada/shop", "../../../../x", "/x"],
			["/home/ada/shop", "/srv/notes", "/srv/notes"],
			["C:\\Users\\ada\\shop", "notes\\threads", "C:/Users/ada/shop/notes/threads"],
			["C:\\Users\\ada\\shop", "..\\..\\..\\..\\x", "C:/x"],
			["C:\\Users\\ada\\shop", "D:\\notes", "D:/notes"],
			["\\\\files\\team\\shop", "notes\\threads", "//files/team/shop/notes/threads"],
			["\\\\files\\team\\shop", "..\\..\\..\\x", "//files/team/x"],
			["/home/ada/shop", "\\\\files\\team\\threads", "//files/team/threads"],
			["//files/team/shop", "./notes/../threads", "//files/team/shop/threads"],
		];
		for (const [base, path, want] of cases)
			expect(`${base} + ${path} = ${resolvePath(base, path)}`).toBe(`${base} + ${path} = ${want}`);
	});

	test("on a network share, looks for .omp/threads.json up to the share's root and no further", async () => {
		const read: string[] = [];
		const files: Record<string, string> = { "//files/team/.omp/threads.json": '{"folder": "threads"}' };
		const io: Io = {
			readText: async path => {
				read.push(path);
				return files[path];
			},
			readPieces: async () => undefined,
			list: async () => undefined,
			run: () => Promise.reject(new Error("no commands here")),
		};
		const place = { home: "\\\\files\\home\\ada", project: "\\\\files\\team\\shop\\src", plugin: "/plugin" };
		expect(await threadsFolder(io, place, undefined)).toEqual({ path: "//files/team/threads", name: "threads" });
		delete files["//files/team/.omp/threads.json"];
		read.length = 0;
		expect(await threadsFolder(io, place, undefined)).toBeUndefined();
		const omp = read.filter(p => p.endsWith(".omp/threads.json"));
		expect(omp).toEqual([
			"//files/team/shop/src/.omp/threads.json",
			"//files/team/shop/.omp/threads.json",
			"//files/team/.omp/threads.json",
		]);
	});
});
