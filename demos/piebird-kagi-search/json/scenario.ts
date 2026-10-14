// piebird-kagi-search: results as data, for the next step. omp alone, on the Kagi session the recorder is given.
import { kagiDemo } from "../feature";

export default kagiDemo("results as data, for the next step", [
	{
		prompt: "Search Kagi for bun sqlite and give me the results as JSON, not prose. Then list just the URLs.",
		caption: "format: json",
		sub: "every tool answers with its data as fields",
	},
]);
