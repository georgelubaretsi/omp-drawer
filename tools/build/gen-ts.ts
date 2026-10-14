// Pieces of the TypeScript the build generates from a source file (core/model.gen.ts,
// core/operations.gen.ts, core/settings.gen.ts), written as oxfmt (.oxfmtrc.json) writes them, so
// the format check passes them unchanged.

const PRINT_WIDTH = 120;

/** An object key, quoted only when it must be. */
export function key(name: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function ascii(s: string): string {
	return s.replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * A string literal of ASCII only, so its width on screen is its length, in the quotes oxfmt picks:
 * double, unless the text has more double quotes than single ones.
 */
function literal(text: string): string {
	const doubled = JSON.stringify(text);
	if (text.split('"').length <= text.split("'").length) return ascii(doubled);
	return ascii(`'${doubled.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`);
}

/** `const SOURCE = "<text>";`, broken after `=` where oxfmt breaks it. */
export function sourceConst(text: string): string {
	const line = `const SOURCE = ${literal(text)};`;
	return line.length <= PRINT_WIDTH ? line : `const SOURCE =\n\t${literal(text)};`;
}

/** The header naming the file a generated one comes from. */
export function generatedFrom(file: string): string {
	return `// Generated from ${file} by \`bun run build\`; edit ${file}.`;
}
