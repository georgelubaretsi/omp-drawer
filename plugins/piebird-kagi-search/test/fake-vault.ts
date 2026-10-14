// A stand-in for the vault, for the "what the model sees" page (scenario.ts): `call <operation>`
// answers with the vault's golden reply to that operation and input (golden.ts); anything else
// fails as a vault would.
import { goldenFor, replyText } from "./golden";

const [command, operation = ""] = Bun.argv.slice(2);
const input: unknown = JSON.parse(await Bun.stdin.text());
const call = command === "call" ? goldenFor(operation, input) : undefined;
if (call === undefined) {
	process.stderr.write(`no golden reply for ${command} ${operation} ${JSON.stringify(input)}\n`);
	process.exit(1);
}
process.stdout.write(replyText(call.name));
