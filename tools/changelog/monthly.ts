// Changelogs that are never released: the workspace's CHANGELOG.md and the public repo's own,
// plugins/CHANGELOG.md (paths relative to the workspace root). Their entries collect under
// `## [Unreleased]`; the first change in a new month moves them into a section for the month they
// were last changed in, `## [YYYY.MM] - YYYY-MM-DD` dated its last day, newest first (cut.ts).
import { posix } from "node:path";

export const MONTHLY = ["CHANGELOG.md", "plugins/CHANGELOG.md"];

/** Whether `file` (relative to the workspace root) is a monthly changelog. */
export function isMonthly(file: string): boolean {
	return MONTHLY.includes(posix.normalize(file));
}

/** A month as one number that orders months (year * 12 + month from 0), in local time. */
export function monthOf(date: Date): number {
	return date.getFullYear() * 12 + date.getMonth();
}

/** The month's section version, `YYYY.MM`. */
export function monthVersion(month: number): string {
	const m = (month % 12) + 1;
	return `${Math.floor(month / 12)}.${m < 10 ? "0" : ""}${m}`;
}

/** The month's section heading, `## [YYYY.MM] - YYYY-MM-DD`, dated its last day. */
export function monthHeading(month: number): string {
	const year = Math.floor(month / 12);
	const last = new Date(Date.UTC(year, (month % 12) + 1, 0)).toISOString().slice(0, 10);
	return `## [${monthVersion(month)}] - ${last}`;
}

/** A month section's version, `YYYY.MM`. */
export const MONTH_VERSION = /^(\d{4})\.(0[1-9]|1[0-2])$/;

/** Problems of a dated release `version` in a monthly changelog: not `YYYY.MM`, or dated outside its month. */
export function monthProblems(file: string, version: string, date: Date): string[] {
	const match = MONTH_VERSION.exec(version);
	if (!match)
		return [`${file}: release ${version} isn't a month; this changelog's sections are "## [YYYY.MM] - YYYY-MM-DD"`];
	// The parser reads YYYY-MM-DD as midnight UTC.
	if (date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2])) return [];
	return [`${file}: release ${version} is dated ${date.toISOString().slice(0, 10)}, outside its month`];
}
