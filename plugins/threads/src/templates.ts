// Every text this plugin shows, one Markdown file in ./templates for each output.
import { Template } from "./template";
import list from "./templates/list.md" with { type: "text" };
import noFolder from "./templates/no-folder.md" with { type: "text" };
import none from "./templates/none.md" with { type: "text" };

/** The template files, by what they show. */
export const templates = {
	list: new Template(list),
	none: new Template(none),
	noFolder: new Template(noFolder),
};
