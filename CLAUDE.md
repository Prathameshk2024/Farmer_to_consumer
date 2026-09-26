# CLAUDE.md

# Workflow

Never do the work yourself.
Always dispatch a sub-agent.
Don't always use Fable. Use Opus 5.5 for easier tasks.

# Model routing

- Fable 5.1: architecture, hard bugs, code review, anything
  where being wrong is expensive
- Opus 5.5: edits, tests, docs, refactors, the bulk of the work
- Haiku 4.5: lookups, file searches, summaries, one-line answers
- Pass `model` on every Agent call. No default routing.

# Delegation

- One sub-agent per task. Plan first, then dispatch.
- Run independent sub-agents in parallel, not one after another.
- Read the report, never the files. If a sub-agent did the work,
  trust its summary instead of re-reading everything it touched.
- Sub-agents return findings, not raw dumps.
