## The open-threads list, put in front of the main agent.

list-header = Open threads in { $folder }/ ({ $count }{ $dormant ->
        [0] {""}
       *[other] ; { $dormant } dormant not shown
    }){ $listed ->
        [yes] :
       *[no] .
    }
thread = - { $slug }
with-detail = { $line } · { $detail }
thread-waiting = waiting on you ({ $questions ->
        [one] { $questions } question
       *[other] { $questions } questions
    })
thread-updated = updated { $updated }{ $uncommitted ->
        [yes] {" "}(uncommitted)
       *[no] {""}
    }
thread-next = next: { $next }
thread-area = { $area }
thread-unreadable = - unreadable: { $source }: { $reason }

## Why a thread file could not be listed, or the project's .omp/threads.json read.

reason-no-front-matter = no front matter
reason-no-field = no "{ $name }" in front matter
reason-no-commit = no commit
reason-git-exited = git exited { $status }
reason-no-folder = { $config } names no "folder" (the threads folder, relative to the folder holding .omp/)
reason-other = { $cause }

## Once there is no list to show.

none = No open threads in { $folder }/.
no-folder = No threads folder here: neither the plugin's folder setting nor a .omp/threads.json names one, so earlier thread lists no longer apply.

## A rule the plugin ships, given to an agent that has no rules of its own: its body.

rule = { $body }
