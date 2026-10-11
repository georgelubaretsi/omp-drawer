// A template file imported as its text: `import text from "./templates/x.md" with { type: "text" }`.
declare module "*.md" {
	const text: string;
	export default text;
}
