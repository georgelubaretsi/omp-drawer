// piebird-kagi-search: web search with your own Kagi account. omp alone, on the Kagi session the recorder is given.
import { kagiDemo } from "../feature";

export default kagiDemo("web search with your own Kagi account", [
	{
		prompt: "What's the latest Bun release, and what changed in it? Search the web.",
		caption: "Searched with Kagi",
		sub: "results with dates and sources",
	},
]);
