// Every text this plugin shows, one Markdown file in ./templates for each output.
import { Template } from "./template";
import answer from "./templates/answer.md" with { type: "text" };
import cancelled from "./templates/errors/cancelled.md" with { type: "text" };
import noTern from "./templates/errors/no-tern.md" with { type: "text" };
import notLoaded from "./templates/errors/not-loaded.md" with { type: "text" };
import nullAnswer from "./templates/errors/null-answer.md" with { type: "text" };
import tooLarge from "./templates/errors/too-large.md" with { type: "text" };
import unclaimed from "./templates/errors/unclaimed.md" with { type: "text" };
import unknown from "./templates/errors/unknown.md" with { type: "text" };
import luaError from "./templates/lua-error.md" with { type: "text" };
import tool from "./templates/tool.md" with { type: "text" };

/** The template files, by what they show. */
export const templates = {
	tool: new Template(tool),
	answer: new Template(answer),
	luaError: new Template(luaError),
	errors: {
		cancelled: new Template(cancelled),
		noTern: new Template(noTern),
		notLoaded: new Template(notLoaded),
		nullAnswer: new Template(nullAnswer),
		tooLarge: new Template(tooLarge),
		unclaimed: new Template(unclaimed),
		unknown: new Template(unknown),
	},
};
