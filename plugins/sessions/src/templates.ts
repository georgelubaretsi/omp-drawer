// Every text this plugin shows, one Markdown file in ./templates for each output.
import { Template } from "./template";
import ask from "./templates/ask.md" with { type: "text" };
import entry from "./templates/entry.md" with { type: "text" };
import ambiguous from "./templates/errors/ambiguous.md" with { type: "text" };
import findWithPage from "./templates/errors/find-with-page.md" with { type: "text" };
import notFound from "./templates/errors/not-found.md" with { type: "text" };
import nothingToRead from "./templates/errors/nothing-to-read.md" with { type: "text" };
import pastEnd from "./templates/errors/past-end.md" with { type: "text" };
import userWithDetails from "./templates/errors/user-with-details.md" with { type: "text" };
import find from "./templates/find.md" with { type: "text" };
import header from "./templates/header.md" with { type: "text" };
import line from "./templates/line.md" with { type: "text" };
import page from "./templates/page.md" with { type: "text" };
import self from "./templates/self.md" with { type: "text" };
import tool from "./templates/tool.md" with { type: "text" };

/** The template files, by what they show. */
export const templates = {
	tool: new Template(tool),
	header: new Template(header),
	entry: new Template(entry),
	ask: new Template(ask),
	line: new Template(line),
	page: new Template(page),
	find: new Template(find),
	self: new Template(self),
	errors: {
		ambiguous: new Template(ambiguous),
		findWithPage: new Template(findWithPage),
		notFound: new Template(notFound),
		nothingToRead: new Template(nothingToRead),
		pastEnd: new Template(pastEnd),
		userWithDetails: new Template(userWithDetails),
	},
};
