import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { readAgentName, readTemporaryAgent } from "./agent-definition";
import type { TemporaryAgentMetadata } from "./domain";

export interface CommandResult {
	stdout: string;
	stderr: string;
	code: number;
}

export type ExecuteCommand = (
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
) => Promise<CommandResult>;

export interface ScopePaths {
	root: string;
	agentsDir: string;
	configPath: string;
}

export async function resolveScopePaths(
	cwd: string,
	scope: "project" | "global",
	execute: ExecuteCommand,
): Promise<ScopePaths> {
	if (scope === "project") {
		const root = resolve(cwd);
		return { root, agentsDir: join(root, ".omp", "agents"), configPath: join(root, ".omp", "config.yml") };
	}

	const result = await execute("omp", ["config", "path"], { cwd, timeout: 10_000 });
	if (result.code !== 0 || result.stdout.trim().length === 0) {
		throw new Error(`Unable to resolve the active OMP config path: ${result.stderr.trim()}`);
	}
	const root = result.stdout.trim().replace(/^~(?=$|\/)/, homedir());
	return { root, agentsDir: join(root, "agents"), configPath: join(root, "config.yml") };
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readOptional(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

async function listMarkdown(directory: string): Promise<string[] | undefined> {
	try {
		return (await readdir(directory)).filter(entry => entry.endsWith(".md")).toSorted();
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

async function findAgentInDirectory(directory: string, name: string): Promise<string | undefined> {
	const entries = await listMarkdown(directory);
	if (entries === undefined) return undefined;

	for (const entry of entries) {
		const content = await readFile(join(directory, entry), "utf8");
		try {
			if (readAgentName(content) === name) return content;
		} catch {
			continue;
		}
	}
	return undefined;
}

export async function loadSourceAgent(name: string, cwd: string, execute: ExecuteCommand): Promise<string> {
	const projectPaths = await resolveScopePaths(cwd, "project", execute);
	const projectAgent = await findAgentInDirectory(projectPaths.agentsDir, name);
	if (projectAgent) return projectAgent;

	const userPaths = await resolveScopePaths(cwd, "global", execute);
	const userAgent = await findAgentInDirectory(userPaths.agentsDir, name);
	if (userAgent) return userAgent;

	const exportDir = await mkdtemp(join(tmpdir(), "omp-agent-variants-"));
	try {
		const result = await execute("omp", ["agents", "unpack", "--dir", exportDir, "--force"], {
			cwd,
			timeout: 30_000,
		});
		if (result.code !== 0) throw new Error(`Unable to export bundled agents: ${result.stderr.trim()}`);
		const bundled = await findAgentInDirectory(exportDir, name);
		if (bundled) return bundled;
	} finally {
		await rm(exportDir, { recursive: true, force: true });
	}

	throw new Error(`Agent “${name}” was not found in project, user, or bundled agent definitions.`);
}

async function atomicWrite(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(dirname(path), `.${basename(path)}.${crypto.randomUUID()}.tmp`);
	await writeFile(temporary, content, "utf8");
	await rename(temporary, path);
}

async function restore(path: string, content: string | undefined): Promise<void> {
	if (content === undefined) {
		try {
			await unlink(path);
		} catch (error) {
			if (!isMissingFile(error)) throw error;
		}
		return;
	}
	await atomicWrite(path, content);
}

export async function writeVariantTransaction(options: {
	agentPath: string;
	agentContent: string;
	configPath: string;
	configContent: string;
}): Promise<void> {
	const agentBefore = await readOptional(options.agentPath);
	const configBefore = await readOptional(options.configPath);
	try {
		await atomicWrite(options.configPath, options.configContent);
		await atomicWrite(options.agentPath, options.agentContent);
	} catch (error) {
		await Promise.all([restore(options.configPath, configBefore), restore(options.agentPath, agentBefore)]).catch(
			() => undefined,
		);
		throw error;
	}
}

export async function readExisting(path: string): Promise<string | undefined> {
	return readOptional(path);
}

export async function scanTemporaryAgents(cwd: string): Promise<TemporaryAgentMetadata[]> {
	const root = resolve(cwd);
	const directory = join(root, ".omp", "agents");
	const entries = await listMarkdown(directory);
	if (entries === undefined) return [];

	const temporary: TemporaryAgentMetadata[] = [];
	for (const entry of entries) {
		try {
			const metadata = readTemporaryAgent(await readFile(join(directory, entry), "utf8"));
			if (metadata) temporary.push(metadata);
		} catch {
			continue;
		}
	}
	return temporary;
}
