// piebird-tern-ghostty-style: a Markdown file with a wide table, rendered in a tab of its own. Tern
// centres rendered Markdown in an 832-pixel column, which cuts the table; with the plugin's Tern
// part turned on (it starts turned off in Tern's settings), the column widens to 1200 and the whole
// table shows.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { writeTernSettings } from "../../../tools/demo/sandbox";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

// About 830 pixels wide: more than Tern's 720 of text, less than the 928 the plugin leaves in this
// 1040-pixel window.
const PRICES = `# Shipping prices

| Zone | Weight up to 1 kg | Up to 5 kg | Up to 20 kg | Express surcharge | Free shipping from | Carrier |
| --- | --- | --- | --- | --- | --- | --- |
| Domestic | 4.90 | 6.90 | 12.90 | 5.00 | 60.00 | Post |
| EU | 9.90 | 14.90 | 29.90 | 9.00 | 120.00 | DHL |
| Rest of world | 19.90 | 34.90 | 69.90 | 19.00 | none | DHL Express |
`;

export default {
	plugins: ["piebird-tern-ghostty-style", "piebird-tern-bridge"],
	projectName: "shop-api",
	// Wider than Tern's 832-pixel column, so the plugin's wider one shows.
	size: [1040, 600],
	ternSettings: { plugins_disabled: ["piebird-tern-ghostty-style"] },
	async setup(s) {
		await writeProject(s.project, { ...shopApi, "docs/shipping.md": PRICES }, "Cart, shipping and its prices");
	},
	async run(d) {
		await intro(d, "piebird-tern-ghostty-style", "Markdown with room for wide tables");
		await d.wait(2000);
		await d.prompt("Open docs/shipping.md rendered in a new tab, and show that tab.");
		d.caption("Tern's own column stops at 832 pixels", "and cuts the table");
		await d.wait(4500);
		// The plugin's Tern part turned on, as in Tern's Preferences › Plugins.
		await writeTernSettings(d.sandbox.tern);
		await d.window.cli("plugin", "reload");
		d.caption("With the plugin, 1200 pixels", "room for the whole table");
		await d.wait(5000);
		await outro(d, "piebird-tern-ghostty-style");
	},
} satisfies Scenario;
