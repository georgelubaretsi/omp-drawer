// Generated from settings.json by `bun run build`; edit settings.json.
import { parseDeclared } from "../kit/core/declared";

const SOURCE =
	'{"settings":{"search":{"type":"choice","title":"Search with Kagi","about":"How much your agent relies on Kagi when it searches the web.","default":"first","choices":[{"value":"only","label":"Kagi only","means":"Every web search goes through Kagi. The agent\'s own web search is refused, even when Kagi fails, and the agent is told not to use other search tools."},{"value":"first","label":"Kagi first","means":"The agent searches with Kagi. Its own web search stays out of the way until a Kagi search fails in the conversation; other search tools are for when Kagi fails or when you ask for one."},{"value":"offered","label":"Kagi offered","means":"Kagi is one more way to search. Nothing is refused or hidden, and the agent picks."}]}},"secrets":{"session":{"title":"Kagi session","about":"The token in your Kagi Session Link, which signs the plugin in to Kagi as you.","env":"KAGI_SESSION_TOKEN"}}}';

export const declared = parseDeclared(SOURCE);
