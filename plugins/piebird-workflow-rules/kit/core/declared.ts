// A plugin's declarations (core/settings.json) as its generated core/settings.gen.ts carries them.
// The build has checked the file against tools/settings.schema.json; this reads it into types and
// refuses a shape the code can't use, so a hand-edited copy fails at load, not later.

export interface Choice {
	readonly value: string;
	readonly label: string;
	readonly means: string;
}

interface Common {
	readonly title: string;
	readonly about: string;
	readonly default: string;
}

/** A setting: a choice among fixed values, a text, or a path. */
export type Declaration =
	| (Common & { readonly type: "choice"; readonly choices: readonly Choice[] })
	| (Common & { readonly type: "text" | "path" });

export interface Secret {
	readonly title: string;
	readonly about: string;
	/** The environment variable that supplies it instead of the secret store. */
	readonly env?: string;
}

export interface Declared {
	readonly settings: Readonly<Record<string, Declaration>>;
	readonly secrets: Readonly<Record<string, Secret>>;
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fields(value: unknown, at: string): Fields {
	if (isFields(value)) return value;
	throw new Error(`settings.json: ${at} isn't an object`);
}

function text(value: unknown, at: string): string {
	if (typeof value === "string") return value;
	throw new Error(`settings.json: ${at} isn't text`);
}

function choice(value: unknown, at: string): Choice {
	const f = fields(value, at);
	return {
		value: text(f.value, `${at}/value`),
		label: text(f.label, `${at}/label`),
		means: text(f.means, `${at}/means`),
	};
}

function declaration(value: unknown, at: string): Declaration {
	const f = fields(value, at);
	const common = {
		title: text(f.title, `${at}/title`),
		about: text(f.about, `${at}/about`),
		default: text(f.default, `${at}/default`),
	};
	if (f.type === "text" || f.type === "path") return { ...common, type: f.type };
	if (f.type !== "choice") throw new Error(`settings.json: ${at}/type is no kind of setting`);
	if (!Array.isArray(f.choices)) throw new Error(`settings.json: ${at}/choices isn't a list`);
	return { ...common, type: "choice", choices: f.choices.map((c: unknown, i) => choice(c, `${at}/choices/${i}`)) };
}

function secret(value: unknown, at: string): Secret {
	const f = fields(value, at);
	const common = { title: text(f.title, `${at}/title`), about: text(f.about, `${at}/about`) };
	return f.env === undefined ? common : { ...common, env: text(f.env, `${at}/env`) };
}

function each<T>(value: unknown, at: string, read: (v: unknown, at: string) => T): Readonly<Record<string, T>> {
	if (value === undefined) return {};
	return Object.fromEntries(Object.entries(fields(value, at)).map(([k, v]) => [k, read(v, `${at}/${k}`)]));
}

export function parseDeclared(source: string): Declared {
	const parsed: unknown = JSON.parse(source);
	const f = fields(parsed, "");
	return { settings: each(f.settings, "/settings", declaration), secrets: each(f.secrets, "/secrets", secret) };
}
