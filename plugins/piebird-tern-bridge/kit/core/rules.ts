// The rules a plugin ships in rules/, read as omp reads them, for a harness with no rules of its
// own: each file's front matter says what it is about (`description`), whether it applies always
// (`alwaysApply`) and to which agents (`agents`: main, reviewer, ...; every agent when absent).
// Only the plain `key: value` lines omp's rules use are read. The build copies kit/ into each
// plugin that needs it (plugins/<name>/kit/); edit it in kit/.

export interface Rule {
	/** The file's name without `.md`. */
	readonly name: string;
	readonly description: string;
	readonly alwaysApply: boolean;
	/** The agents it is for; undefined for every agent. */
	readonly agents?: readonly string[];
	/** The text after the front matter, trimmed: what omp gives an always-applied rule. */
	readonly body: string;
}

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A front matter value, unquoted as YAML quotes one. */
function value(raw: string): string {
	const text = raw.trim();
	const quoted = /^"(.*)"$/.exec(text) ?? /^'(.*)'$/.exec(text);
	return quoted?.[1] ?? text;
}

/** The rule in `text`, the file `<name>.md`. */
export function parseRule(name: string, text: string): Rule {
	const front = FRONT.exec(text);
	const fields = new Map<string, string>();
	for (const line of (front?.[1] ?? "").split(/\r?\n/)) {
		const at = line.indexOf(":");
		if (at > 0) fields.set(line.slice(0, at).trim(), value(line.slice(at + 1)));
	}
	const agents = fields.get("agents");
	return {
		name,
		description: fields.get("description") ?? "",
		alwaysApply: fields.get("alwaysApply") === "true",
		...(agents === undefined
			? {}
			: {
					agents: agents
						.replace(/^\[|\]$/g, "")
						.split(",")
						.map(a => value(a)),
				}),
		body: (front ? text.slice(front[0].length) : text).trim(),
	};
}

/** Whether `rule` is for the agent `agent` (main, reviewer, ...). */
export function ruleIsFor(rule: Rule, agent: string): boolean {
	return rule.agents === undefined || rule.agents.includes(agent);
}
