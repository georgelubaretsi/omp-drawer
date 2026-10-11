// The agent-content pages' wording, one Markdown template per page in ./templates, filled by the
// plugins' strict Template: a value a template names that the code doesn't pass throws.
import { Template } from "../../plugins/sessions/src/template";
import agentVariants from "./templates/agent-variants.md" with { type: "text" };
import index from "./templates/index.md" with { type: "text" };
import kagi from "./templates/kagi.md" with { type: "text" };
import rules from "./templates/rules.md" with { type: "text" };
import sessions from "./templates/sessions.md" with { type: "text" };
import skills from "./templates/skills.md" with { type: "text" };
import tern from "./templates/tern.md" with { type: "text" };
import threads from "./templates/threads.md" with { type: "text" };
import workflowSkills from "./templates/workflow-skills.md" with { type: "text" };
import workflow from "./templates/workflow.md" with { type: "text" };

/** The page templates, by page, and the sections pages share (rules, skills). */
export const templates = {
	index: new Template(index),
	sessions: new Template(sessions),
	threads: new Template(threads),
	tern: new Template(tern),
	agentVariants: new Template(agentVariants),
	workflow: new Template(workflow),
	workflowSkills: new Template(workflowSkills),
	kagi: new Template(kagi),
	rules: new Template(rules),
	skills: new Template(skills),
};
