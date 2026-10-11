// The sessions plugin: the session_read tool, which reads omp session journals without opening
// them whole, and a line, shown in the chat, that tells the main agent its own session.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { DEFAULT_SESSIONS_ROOT } from "./journal";
import { readSession, TOOL_NAME } from "./read";
import { SELF_TYPE, selfMessage } from "./self";
import { templates } from "./templates";

export default function sessions(pi: ExtensionAPI): void {
	const z = pi.zod;
	const { tool } = templates;
	const described = (name: string) => tool.text(`parameters.${name}`);
	pi.setLabel(tool.text("plugin"));
	const parameters = z.object({
		session: z.string().describe(described("session")),
		line: z.number().int().positive().optional().describe(described("line")),
		before: z.number().int().positive().optional().describe(described("before")),
		after: z.number().int().positive().optional().describe(described("after")),
		find: z.string().optional().describe(described("find")),
		user: z.boolean().optional().describe(described("user")),
		thinking: z.boolean().optional().describe(described("thinking")),
		tools: z.boolean().optional().describe(described("tools")),
		raw: z.boolean().optional().describe(described("raw")),
	});
	type ToolParameters = (typeof parameters)["infer"];

	pi.registerTool<typeof parameters>({
		name: TOOL_NAME,
		label: tool.text("label"),
		description: tool.render(),
		parameters,
		loadMode: "essential",
		approval: "read",
		// oxlint-disable-next-line eslint/max-params -- omp's tool execute signature: the context comes fifth
		async execute(_toolCallId, params: ToolParameters, signal, _onUpdate, ctx) {
			const roots = [DEFAULT_SESSIONS_ROOT, ctx.sessionManager.getSessionDir()];
			const text = await readSession(params, { roots, signal });
			return { content: [{ type: "text", text }], details: { session: params.session } };
		},
	});

	pi.on("before_agent_start", (_event, ctx) => {
		const content = selfMessage(ctx);
		return content === undefined ? undefined : { message: { customType: SELF_TYPE, content, display: true } };
	});
}
