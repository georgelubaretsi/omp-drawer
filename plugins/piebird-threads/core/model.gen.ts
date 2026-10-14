// Generated from model.ftl by `bun run build`; edit model.ftl.
import { Catalog } from "../kit/core/model";

const SOURCE =
	'## The open-threads list, put in front of the main agent.\n\nlist-header = Open threads in { $folder }/ ({ $count }{ $dormant ->\n        [0] {""}\n       *[other] ; { $dormant } dormant not shown\n    }){ $listed ->\n        [yes] :\n       *[no] .\n    }\nthread = - { $slug }\nwith-detail = { $line } \u00b7 { $detail }\nthread-waiting = waiting on you ({ $questions ->\n        [one] { $questions } question\n       *[other] { $questions } questions\n    })\nthread-updated = updated { $updated }{ $uncommitted ->\n        [yes] {" "}(uncommitted)\n       *[no] {""}\n    }\nthread-next = next: { $next }\nthread-area = { $area }\nthread-unreadable = - unreadable: { $source }: { $reason }\n\n## Why a thread file could not be listed, or the project\'s .omp/threads.json read.\n\nreason-no-front-matter = no front matter\nreason-no-field = no "{ $name }" in front matter\nreason-no-commit = no commit\nreason-git-exited = git exited { $status }\nreason-no-folder = { $config } names no "folder" (the threads folder, relative to the folder holding .omp/)\nreason-other = { $cause }\n\n## Once there is no list to show.\n\nnone = No open threads in { $folder }/.\nno-folder = No threads folder here: neither the plugin\'s folder setting nor a .omp/threads.json names one, so earlier thread lists no longer apply.\n\n## A rule the plugin ships, given to an agent that has no rules of its own: its body.\n\nrule = { $body }\n';

export type Messages = {
	"list-header": {
		count: string | number;
		dormant: string | number;
		folder: string | number;
		listed: string | number;
	};
	"no-folder": undefined;
	none: {
		folder: string | number;
	};
	"reason-git-exited": {
		status: string | number;
	};
	"reason-no-commit": undefined;
	"reason-no-field": {
		name: string | number;
	};
	"reason-no-folder": {
		config: string | number;
	};
	"reason-no-front-matter": undefined;
	"reason-other": {
		cause: string | number;
	};
	rule: {
		body: string | number;
	};
	thread: {
		slug: string | number;
	};
	"thread-area": {
		area: string | number;
	};
	"thread-next": {
		next: string | number;
	};
	"thread-unreadable": {
		reason: string | number;
		source: string | number;
	};
	"thread-updated": {
		uncommitted: string | number;
		updated: string | number;
	};
	"thread-waiting": {
		questions: string | number;
	};
	"with-detail": {
		detail: string | number;
		line: string | number;
	};
};

export const model = new Catalog<Messages>(SOURCE);
