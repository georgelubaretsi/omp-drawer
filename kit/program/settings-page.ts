// The settings page: the person's own choices for plugins, kept in their file
// (~/.agents/piebird/settings.json, a section per plugin), which every agent reads beneath its own
// settings screen (kit/core/settings.ts). For the people whose agent has no screen for them (Codex,
// ChatGPT desktop), served by `<program> settings` and by the installer.
// The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import type { Declaration, Declared } from "../core/declared";

export interface PagePlugin {
	readonly name: string;
	/** The name people see, when it isn't the plugin's own. */
	readonly title?: string;
	readonly declared: Declared;
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escape(text: string): string {
	return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

/** The person's own value for the setting, when it is one the declaration allows. */
function chosen(file: unknown, plugin: string, key: string, d: Declaration): string | undefined {
	const section = isFields(file) ? file[plugin] : undefined;
	const value = isFields(section) ? section[key] : undefined;
	if (typeof value !== "string") return undefined;
	return d.type === "choice" && !d.choices.some(c => c.value === value) ? undefined : value;
}

/** What "Automatic" (no choice of the person's) means: the project's choice, else the default. */
function automaticMeans(d: Declaration): string {
	const fallback = d.type === "choice" ? d.choices.find(c => c.value === d.default)?.label : d.default;
	return fallback ? `Each project's own choice, else the default: ${fallback}.` : "Each project's own choice.";
}

/**
 * One setting's controls. `value` is the person's own, undefined when they set none: "Automatic"
 * leaves it to the project's settings and the default, and any value picked is kept, the
 * default's too, so it holds over a project's choice.
 */
function settingHtml(plugin: string, key: string, d: Declaration, value: string | undefined): string {
	const name = escape(`${plugin}/${key}`);
	const head = `<h3>${escape(d.title)}</h3><p>${escape(d.about)}</p>`;
	if (d.type !== "choice") {
		const hint = ` placeholder="${escape(d.default ? `Automatic: ${d.default}` : "Automatic")}"`;
		return `<div class="setting">${head}<input type="text" name="${name}" value="${escape(value ?? "")}"${hint}></div>`;
	}
	const radio = (v: string, label: string, means: string, mark = "") =>
		`<label class="choice"><input type="radio" name="${name}" value="${escape(v)}"${(value ?? "") === v ? " checked" : ""}><span><strong>${escape(label)}</strong>${mark}<br>${escape(means)}</span></label>`;
	const options = d.choices.map(c =>
		radio(c.value, c.label, c.means, c.value === d.default ? " <em>(default)</em>" : ""),
	);
	return `<div class="setting">${head}${radio("", "Automatic", automaticMeans(d))}${options.join("")}</div>`;
}

const STYLE = `:root{--bg:#fff;--fg:#1d1d1f;--line:#d2d2d7}
@media(prefers-color-scheme:dark){:root{--bg:#1d1d1f;--fg:#f5f5f7;--line:#3a3a3c}input[type=text]{background:#2c2c2e;color:#f5f5f7}}
body{font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;max-width:680px;margin:40px auto 0;padding:0 20px;color:var(--fg);background:var(--bg)}
h1{font-size:24px}h2{font-size:18px;margin-top:32px}h3{font-size:15px;margin:20px 0 4px}p{margin:0 0 8px;opacity:.8}
.choice{display:flex;gap:10px;align-items:flex-start;padding:8px 0}input[type=text]{width:100%;padding:8px;border:1px solid #888;border-radius:6px;font:inherit}
.bar{position:sticky;bottom:0;display:flex;align-items:center;gap:12px;padding:14px 0 18px;margin-top:28px;background:var(--bg);border-top:1px solid var(--line)}
button{padding:10px 22px;border:0;border-radius:8px;background:#0071e3;color:#fff;font:inherit;cursor:pointer}`;

const SCRIPT = `document.querySelector("form").addEventListener("submit", async e => {
e.preventDefault();
const choices = {};
for (const [name, value] of new FormData(e.target)) { const [p, k] = name.split("/"); (choices[p] ??= {})[k] = value; }
const res = await fetch(location.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(choices) });
const answer = await res.json();
document.getElementById("status").textContent = res.ok ? "Saved. New sessions use it." : answer.problems.join(" ");
});`;

/** The page: each plugin's settings, set to the person's own value, or "Automatic" without one. */
export function settingsHtml(plugins: readonly PagePlugin[], file: unknown): string {
	const sections = plugins
		.filter(p => Object.keys(p.declared.settings).length > 0)
		.map(p => {
			const settings = Object.entries(p.declared.settings).map(([key, d]) =>
				settingHtml(p.name, key, d, chosen(file, p.name, key, d)),
			);
			return `<h2>${escape(p.title ?? p.name)}</h2>${settings.join("")}`;
		});
	const body = sections.length > 0 ? sections.join("") : "<p>These plugins have no settings.</p>";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>piebird settings</title><style>${STYLE}</style></head><body><h1>piebird settings</h1><p>Your choices for every agent on this computer, over any project's. An agent's own settings screen, where it has one, can still choose otherwise.</p><form>${body}<div class="bar"><button type="submit">Save</button><span id="status" role="status"></span></div></form><script>${SCRIPT}</script></body></html>`;
}

/**
 * The person's file with `choices` for `plugin`: other plugins' sections and keys the page doesn't
 * know are kept; an empty value ("Automatic") removes the setting, so the project's choice or the
 * default applies, and any other is kept, the default's too. A value the declaration doesn't allow
 * is a problem, and nothing changes.
 */
export function withChoices(
	file: unknown,
	plugin: PagePlugin,
	choices: Readonly<Record<string, unknown>>,
): { file: Fields; problems: string[] } {
	const next: Fields = isFields(file) ? { ...file } : {};
	const current = next[plugin.name];
	const section: Fields = isFields(current) ? { ...current } : {};
	const problems: string[] = [];
	for (const [key, value] of Object.entries(choices)) {
		const d = plugin.declared.settings[key];
		if (!d || typeof value !== "string") problems.push(`${plugin.name} has no setting ${key}.`);
		else if (value === "") delete section[key];
		else if (d.type === "choice" && !d.choices.some(c => c.value === value))
			problems.push(`${d.title} can't be "${value}".`);
		else section[key] = value;
	}
	if (Object.keys(section).length > 0) next[plugin.name] = section;
	else delete next[plugin.name];
	return { file: next, problems };
}
