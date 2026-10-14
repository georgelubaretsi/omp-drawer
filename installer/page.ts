// The installer's page: the agents found here, the plugins with where each goes, and Install and
// Remove; what they did is shown in place, with the buttons for what's left to the person
// (restarting an app, adding to Claude chat, signing in). It tells the installer it is open, so the
// installer quits soon after the page is closed.

export interface PageView {
	readonly agents: readonly { readonly label: string; readonly found: boolean }[];
	readonly plugins: readonly {
		readonly name: string;
		readonly title: string;
		readonly description: string;
		readonly goesTo: readonly string[];
	}[];
	readonly settingsUrl?: string;
	/** Whether a piebird install is here to remove. */
	readonly installed: boolean;
}

function escape(text: string): string {
	return text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

const STYLE = `:root{--bg:#fff;--fg:#1d1d1f;--line:#d2d2d7;--second:#e8e8ed}
@media(prefers-color-scheme:dark){:root{--bg:#1d1d1f;--fg:#f5f5f7;--line:#3a3a3c;--second:#3a3a3c}}
body{font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;max-width:640px;margin:48px auto 0;padding:0 24px;color:var(--fg);background:var(--bg)}
h1{font-size:28px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}p{margin:0 0 8px}.muted{opacity:.65}
.agents{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.agents li{padding:4px 12px;border-radius:999px;background:rgba(0,113,227,.12)}.agents li.absent{background:none;opacity:.45;text-decoration:line-through}
.plugin{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--line);border-radius:12px;margin:8px 0}.plugin input{margin-top:4px}.plugin small{display:block;opacity:.65}
details{margin:16px 0}summary{cursor:pointer;opacity:.75}details .plugin{opacity:.6}
#actions{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;padding:14px 0 18px;margin-top:24px;background:var(--bg);border-top:1px solid var(--line)}#status{opacity:.75}
button{padding:10px 22px;border:0;border-radius:8px;background:#0071e3;color:#fff;font:inherit;cursor:pointer}button.second{background:var(--second);color:var(--fg)}button:disabled{opacity:.5;cursor:default}
#result{margin-top:16px;scroll-margin-bottom:96px}#result button{margin:0 8px 8px 0}#result ul{list-style:none;padding-left:0}#result li{padding-left:1.5em;text-indent:-1.5em;margin:4px 0}
#result li.ok::before{content:"✓";display:inline-block;width:1.5em;text-indent:0;color:#1a7f37}#result li.fail{color:#d70015}#result li.fail::before{content:"✗";display:inline-block;width:1.5em;text-indent:0}a{color:#0071e3}`;

// A goodbye from a page being reloaded can come after the new page's first request: the page
// speaks at once and every 5 seconds, which the installer outwaits before taking a goodbye as final.
const SCRIPT = `const post = body => fetch(location.pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
post({ op: "alive" });
setInterval(() => post({ op: "alive" }), 5000);
addEventListener("pagehide", () => navigator.sendBeacon(location.pathname, JSON.stringify({ op: "bye" })));
const result = document.getElementById("result");
const status = document.getElementById("status");
const remove = document.getElementById("remove");
const busy = on => document.querySelectorAll("#actions button").forEach(b => (b.disabled = on));
function button(label, body) {
	const b = document.createElement("button");
	b.textContent = label;
	b.className = "second";
	b.onclick = async () => { b.disabled = true; const a = await post(body); b.textContent = a.text; };
	result.append(b);
}
function show(answer) {
	result.replaceChildren();
	const list = document.createElement("ul");
	for (const s of answer.steps.filter(s => s.text)) {
		const li = document.createElement("li");
		li.textContent = s.text;
		li.className = s.ok ? "ok" : "fail";
		list.append(li);
	}
	if (!list.children.length) list.innerHTML = "<li>Nothing to do here.</li>";
	result.append(list);
	answer.opens.forEach((o, index) => button(o.label, { op: "open", index }));
	answer.restarts.forEach(r => button("Restart " + r.label, { op: "restart", app: r.app }));
	answer.signIns.forEach(s => button(s.label, { op: "sign-in", plugin: s.plugin }));
	remove.hidden = !answer.installed;
	status.textContent = answer.steps.every(s => s.ok) ? "Done." : "Done, with problems: see above.";
	result.scrollIntoView({ behavior: "smooth", block: "end" });
}
async function run(body, doing) {
	busy(true);
	status.textContent = doing;
	try { const a = await post(body); a.steps ? show(a) : (status.textContent = a.text); } catch (e) { status.textContent = "The installer stopped: " + e; }
	busy(false);
}
document.getElementById("install").onclick = () => {
	const plugins = [...document.querySelectorAll("input[name=plugin]:checked")].map(i => i.value);
	if (plugins.length) run({ op: "install", plugins }, "Installing…");
	else status.textContent = "Pick a plugin first.";
};
remove.onclick = () => { if (confirm("Remove the piebird plugins from every app here? Your piebird settings and sign-ins stay; choices made in an app's own plugin settings, such as Claude Code's, go with the plugins.")) run({ op: "uninstall" }, "Removing…"); };`;

function pluginHtml(p: PageView["plugins"][number]): string {
	const here = p.goesTo.length > 0;
	const where = here ? `Goes to ${escape(p.goesTo.join(", "))}` : "";
	return `<label class="plugin"><input type="checkbox" name="plugin" value="${escape(p.name)}"${here ? " checked" : " disabled"}><span><strong>${escape(p.title)}</strong><br>${escape(p.description)}<small>${where}</small></span></label>`;
}

/** The plugins for the apps here, then, folded away, the ones for apps that aren't. */
function pluginsHtml(plugins: PageView["plugins"]): string {
	const here = plugins.filter(p => p.goesTo.length > 0);
	const elsewhere = plugins.filter(p => p.goesTo.length === 0);
	const folded =
		elsewhere.length > 0
			? `<details><summary>${elsewhere.length} more, for apps that aren't on this computer</summary>${elsewhere.map(pluginHtml).join("")}</details>`
			: "";
	return here.map(pluginHtml).join("") + folded;
}

export function pageHtml(view: PageView): string {
	const agents = view.agents.map(a => `<li class="${a.found ? "found" : "absent"}">${escape(a.label)}</li>`).join("");
	const any = view.agents.some(a => a.found);
	const intro = any
		? "<p>Pick the plugins you want; each goes to every app on this computer that takes it.</p>"
		: "<p>None of the apps these plugins are for is on this computer. Install ChatGPT or Claude, then open this again.</p>";
	const settings = view.settingsUrl
		? `<p><a href="${escape(view.settingsUrl)}" target="_blank" rel="noopener">Settings for the plugins</a></p>`
		: "";
	const remove = `<button id="remove" class="second"${view.installed ? "" : " hidden"}>Remove</button>`;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>piebird</title><style>${STYLE}</style></head><body>
<h1>piebird</h1><p class="muted">Plugins for ChatGPT, Claude and coding agents.</p>
<h2>On this computer</h2><ul class="agents">${agents}</ul>
<h2>Plugins</h2>${intro}${pluginsHtml(view.plugins)}
<div id="result" role="status" aria-live="polite"></div>${settings}
<div id="actions"><button id="install"${any ? "" : " disabled"}>Install</button>${remove}<span id="status"></span></div>
<script>${SCRIPT}</script></body></html>`;
}
