// Every text this plugin shows, one Markdown file in ./templates for each output.
import { Template } from "./template";
import approval from "./templates/approval.md" with { type: "text" };
import blocked from "./templates/blocked.md" with { type: "text" };
import configured from "./templates/configured.md" with { type: "text" };
import agentNotFound from "./templates/errors/agent-not-found.md" with { type: "text" };
import badConfig from "./templates/errors/bad-config.md" with { type: "text" };
import badFrontmatter from "./templates/errors/bad-frontmatter.md" with { type: "text" };
import badName from "./templates/errors/bad-name.md" with { type: "text" };
import configPath from "./templates/errors/config-path.md" with { type: "text" };
import exists from "./templates/errors/exists.md" with { type: "text" };
import exportFailed from "./templates/errors/export-failed.md" with { type: "text" };
import missingField from "./templates/errors/missing-field.md" with { type: "text" };
import noFrontmatter from "./templates/errors/no-frontmatter.md" with { type: "text" };
import noModel from "./templates/errors/no-model.md" with { type: "text" };
import noSelector from "./templates/errors/no-selector.md" with { type: "text" };
import notTemporary from "./templates/errors/not-temporary.md" with { type: "text" };
import otherVariant from "./templates/errors/other-variant.md" with { type: "text" };
import persistentOverride from "./templates/errors/persistent-override.md" with { type: "text" };
import roleExists from "./templates/errors/role-exists.md" with { type: "text" };
import uncommitted from "./templates/errors/uncommitted.md" with { type: "text" };
import notice from "./templates/notice.md" with { type: "text" };
import tool from "./templates/tool.md" with { type: "text" };
import variant from "./templates/variant.md" with { type: "text" };

/** The template files, by what they show. */
export const templates = {
	tool: new Template(tool),
	blocked: new Template(blocked),
	approval: new Template(approval),
	configured: new Template(configured),
	notice: new Template(notice),
	variant: new Template(variant),
	errors: {
		badName: new Template(badName),
		notTemporary: new Template(notTemporary),
		exists: new Template(exists),
		otherVariant: new Template(otherVariant),
		uncommitted: new Template(uncommitted),
		noModel: new Template(noModel),
		configPath: new Template(configPath),
		exportFailed: new Template(exportFailed),
		agentNotFound: new Template(agentNotFound),
		noFrontmatter: new Template(noFrontmatter),
		badFrontmatter: new Template(badFrontmatter),
		missingField: new Template(missingField),
		noSelector: new Template(noSelector),
		badConfig: new Template(badConfig),
		roleExists: new Template(roleExists),
		persistentOverride: new Template(persistentOverride),
	},
};
