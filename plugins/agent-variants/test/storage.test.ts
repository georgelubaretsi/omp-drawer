import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentVariant } from "../src/agent-definition";
import { resolveScopePaths, scanTemporaryAgents, writeVariantTransaction } from "../src/storage";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function project(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "omp-agent-variants-test-"));
	roots.push(root);
	await mkdir(join(root, ".git"));
	return root;
}

describe("temporary agent storage", () => {
	test("commits agent and route files and discovers the temporary marker", async () => {
		const root = await project();
		const source = `---\nname: designer\ndescription: UI specialist\n---\n\nDesign precisely.\n`;
		const agentContent = createAgentVariant(source, {
			name: "tmp-designer-kimi-k3",
			role: "tmp_designer_kimi_k3",
			requestedModel: "Kimi K3",
			createdAt: "2026-08-26T12:00:00.000Z",
		});
		const agentPath = join(root, ".omp", "agents", "tmp-designer-kimi-k3.md");
		const configPath = join(root, ".omp", "config.yml");

		await writeVariantTransaction({
			agentPath,
			agentContent,
			configPath,
			configContent: "modelRoles:\n  tmp_designer_kimi_k3: kimi-code/k3\n",
		});

		expect(await Bun.file(configPath).text()).toContain("kimi-code/k3");
		expect(await scanTemporaryAgents(root)).toEqual([
			{
				name: "tmp-designer-kimi-k3",
				sourceAgent: "designer",
				requestedModel: "Kimi K3",
				createdAt: "2026-08-26T12:00:00.000Z",
				role: "tmp_designer_kimi_k3",
			},
		]);
	});

	test("ignores ordinary project agents", async () => {
		const root = await project();
		const agents = join(root, ".omp", "agents");
		await mkdir(agents, { recursive: true });
		await writeFile(join(agents, "designer.md"), "---\nname: designer\ndescription: UI specialist\n---\nBody\n");

		expect(await scanTemporaryAgents(root)).toEqual([]);
	});

	test("keeps project agent and role configuration at the session cwd", async () => {
		const root = await project();
		const cwd = join(root, "packages", "ui");
		await mkdir(cwd, { recursive: true });
		const paths = await resolveScopePaths(cwd, "project", async () => {
			throw new Error("Project scope must not query global configuration.");
		});

		expect(paths).toEqual({
			root: cwd,
			agentsDir: join(cwd, ".omp", "agents"),
			configPath: join(cwd, ".omp", "config.yml"),
		});
	});
});
