// What the main agent is told about the project's threads, and when: the list when it differs from
// the last one the agent got; once every thread is closed or dormant, a line saying there are none;
// once nothing names a threads folder any more, a line saying earlier lists no longer apply. An
// agent with no rules of its own gets the plugin's rule with the list.
import type { Io, Place } from "../kit/core/io";
import type { ModelText } from "../kit/core/model";
import type { AgentChoice } from "../kit/core/settings";
import { parseRule } from "../kit/core/rules";
import { threadsFolder } from "./folder";
import { threadsList } from "./list";
import { model } from "./model.gen";

/**
 * What to tell the agent now, given the last text it got (undefined for none since the start or
 * the last compaction), or undefined when that still holds. `now` is seconds since the epoch.
 */
export async function threadsUpdate(
	io: Io,
	place: Place,
	at: { readonly choice?: AgentChoice; readonly last: unknown; readonly now: number },
): Promise<ModelText | undefined> {
	const folder = await threadsFolder(io, place, at.choice);
	if (folder === undefined) {
		// A list sent earlier must not stay the latest word once nothing names its folder.
		const gone = model.text("no-folder");
		return at.last === undefined || at.last === gone.text ? undefined : gone;
	}
	// A list sent earlier must not stay the latest word once every thread is closed or dormant.
	const text =
		(await threadsList(io, folder, at.now)) ??
		(at.last === undefined ? undefined : model.text("none", { folder: folder.name }));
	return text === undefined || text.text === at.last ? undefined : text;
}

/** A rule file's body, as omp gives an always-applied rule: front matter left out. */
export function ruleText(markdown: string): ModelText {
	return model.text("rule", { body: parseRule("threads", markdown).body });
}
