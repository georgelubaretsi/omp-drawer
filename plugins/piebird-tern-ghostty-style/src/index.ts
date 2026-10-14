// The look is the Tern part (../so.stencil.tern): style sheets only. omp's part brings it to Tern.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { keepTernPart } from "../kit/omp/tern-part";

export default function ternGhosttyStyle(pi: ExtensionAPI) {
	keepTernPart(pi, "piebird-tern-ghostty-style");
}
