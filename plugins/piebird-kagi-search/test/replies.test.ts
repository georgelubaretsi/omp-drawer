// The vault and the core agree: each golden reply (test/golden.ts) is what core/operations.json
// declares for its operation, and the core turns each into the model's text with words from
// model.ftl for every value, never its fallback for a reply it doesn't know.
import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020";
import { handlersFor } from "../core/handlers";
import { operations } from "../core/operations.gen";
import { traceMessages } from "../kit/core/model";
import { CALLS, goldenIo, replyText } from "./golden";

const ajv = new Ajv2020({ allErrors: true, strict: false });

describe.each(CALLS.map(c => [c.name, c] as const))("the golden reply %s", (_name, call) => {
	const op = operations.byId.get(call.op);
	const reply: unknown = JSON.parse(replyText(call.name));

	test("fits its operation's declaration", () => {
		if (op === undefined) throw new Error(`no operation ${call.op}`);
		expect(ajv.validate(op.input, call.input)).toBe(true);
		const output: unknown = typeof reply === "object" && reply !== null ? Reflect.get(reply, "output") : undefined;
		const error: unknown = typeof reply === "object" && reply !== null ? Reflect.get(reply, "error") : undefined;
		if (output !== undefined) {
			expect({ valid: ajv.validate(op.output, output), errors: ajv.errors ?? null }).toEqual({
				valid: true,
				errors: null,
			});
		} else {
			const id: unknown = typeof error === "object" && error !== null ? Reflect.get(error, "id") : undefined;
			expect(op.errors).toContain(String(id));
		}
	});

	test("reads as the catalog's words, without the fallback for a reply core doesn't know", async () => {
		const handler = handlersFor(goldenIo({ prefer: [call.name] }), "/plugin/native/kagi-vault")[call.op];
		if (handler === undefined) throw new Error(`no handler for ${call.op}`);
		const { value, ids } = await traceMessages(() => handler(call.input));
		expect(ids).not.toContain("error-failed");
		expect(ids).not.toContain("error-vault");
		expect(value.text.text).not.toBe("");
	});
});
