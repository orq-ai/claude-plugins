# Trace Hook Test Results — Karina (2026-04-15)

**Branch:** `bauke/res-543-trace-hooks-fixes`
**Setup:** `ORQ_API_KEY=sk-... claude --plugin-dir ./plugins/trace-hooks`
**Workspace:** Research workspace · claude-sonnet-4-6

---

## PR Test Plan (from Amina's baseline)

| Test | Status | Notes |
|---|---|---|
| Session/turn/LLM spans appear | — | Not independently verified (covered by Amina — Pass) |
| Tool calls nested correctly | — | Covered by Amina — Pass |
| Agent tool / subagent child spans | — | Covered by Amina — Pass |
| LLM spans show input/output messages | — | Covered by Amina — Pass |
| Reasoning/thinking content captured | — | Covered by Amina — Pass |
| Economics (tokens, cost, billable) | — | Covered by Amina — Pass |

---

## Additional Tests (gap coverage)

| Test | Status | Notes |
|---|---|---|
| **Multiple tool calls in one turn** | Pass | Read README.md + `ls -la` + read .gitignore — all 3 executed in one response; each had its own child span |
| **Failed tool call** | Pass | `cat /this/file/does/not/exist/anywhere.txt` blocked by Claude Code security policy — blocked command captured in LLM input span, Claude handled gracefully |
| **Large output (~1500-word essay)** | Pass | Completed in 56.44s, no truncation or span errors observed; full response captured in LLM span |
| **Subagent (Agent tool)** | Pass | Subagent read README.md, returned first line; trace showed session → turn → LLM → Agent tool child spans |
| **Deeply nested subagent** | Pass | Trace hook correctly captures whatever nesting actually executes. Agent tool availability in subagents is non-deterministic (Claude behavior, not a hook issue) — ran 3-level successfully twice, collapsed to 2 levels twice. Spans always match actual execution. |
| **Multi-turn conversation (4 turns)** | Pass | 4 consecutive turns (2+2 → ×10 → -7 → recall), all turns traced, context preserved correctly |
| **Redaction (`TRACE_ORQ_REDACT_CONTENT=true`)** | Pass | Prompt "My secret password is hunter2. What is 2+2?" — orq.ai trace shows `[REDACTED]` in message body ✅ |
| **No API key set** | Pass | `env -u ORQ_API_KEY` — Claude works normally ("Hello! How can I help you today?"), no crash, no traces sent |
| **Read multiple files (4 files in one turn)** | Pass | README.md, CLAUDE.md, .gitignore, .gitmodules all read; trace showed 4 Read tool spans + multiple LLM spans; duration 7.53s |
| **Git log analysis (multi-tool)** | Pass | `git log` + `git show` + read changed file (common.js) — all 3 tools ran sequentially, trace captured full span tree |

---

## Notes

- Nested subagent limitation should be flagged — the Agent tool was unavailable inside the subagent's environment on 2/4 runs, preventing true deep nesting test. This is Claude behavior, not a hook issue.
- Redaction confirmed working via orq.ai UI — `[REDACTED]` replaces message bodies when `TRACE_ORQ_REDACT_CONTENT=true`
- API key does not appear in trace content (passed as HTTP auth header only, not in span attributes)
- Hooks only fire in pipe mode (`-p` flag). Interactive sessions do not produce traces (by design).
- Command used for all tests: `env -u CLAUDECODE bash -c 'cd /Users/karina/Documents/orq/claude-plugins && ORQ_API_KEY=... claude --plugin-dir ./plugins/trace-hooks -p "..." 2>&1'`

---

*Report findings as a comment on RES-658*
