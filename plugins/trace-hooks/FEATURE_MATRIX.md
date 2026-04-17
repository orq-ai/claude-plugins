# Trace Hook Feature Comparison Matrix

Last updated: 2026-04-17

## Current Feature Inventory

### Hooks Used (8 of 27 available)

| Hook | Handler | Purpose |
|---|---|---|
| SessionStart | `handleSessionStart` | Initialize session state, prune stale files |
| UserPromptSubmit | `handleUserPromptSubmit` | Open new turn, close previous turn span |
| PostToolUseFailure | `handlePostToolUseFailure` | Track failed tool calls |
| Stop | `handleStop` | Process transcript, emit tool + LLM spans |
| PreCompact | `handlePreCompact` | Emit context compaction event span |
| SessionEnd | `handleSessionEnd` | Batch-send root + turn + transcript spans, cleanup |
| SubagentStart | `handleSubagentStart` | Track subagent lifecycle start |
| SubagentStop | `handleSubagentStop` | Emit subagent + child spans via transcript reuse |

### Span Types

| Span | Name Format | Type | Key Attributes |
|---|---|---|---|
| Session root | `orq.claude_code.session` | workflow | session_id, cwd, model, git branch/repo, permission_mode, total turns/tools, end_reason |
| Turn | `claude_code.turn.N` | agent | turn index, end_reason, user prompt, agent name/id |
| LLM response | `chat <model>` | llm | model, finish_reason, conversation thread, response with parts, token usage |
| Tool call | `execute_tool <name>` | tool | tool name, arguments, result, incomplete flag |
| Subagent | `subagent.<type>` | agent | agent_id, type, output, child tool+LLM spans |
| Compact | `claude.context.compact` | event | turn count at compaction |

### Other Features

- Conversation threading (accumulated messages per LLM span)
- Reasoning/thinking content capture (via `parts`)
- Redaction: key patterns, value patterns, stringified JSON parsing, .env paths
- Full-body redaction opt-in (`TRACE_ORQ_REDACT_CONTENT`)
- Failed tool call tracking
- Offline queue with retry (100-file cap, 30s drain cooldown)
- File-based session locking (O_EXCL, stale lock auto-break at 10s)
- Stale file pruning (24h sessions, 1h queue)
- Multi-profile config resolution (env vars → orqi profiles → config.json)
- Batched SessionEnd send (single HTTP request, parents first)

---

## Competitive Comparison

### vs Braintrust (`trace-claude-code`)

| Feature | orq | Braintrust | Gap |
|---|---|---|---|
| Session/turn/tool/LLM spans | Yes | Yes | Parity |
| Token usage + cost | Yes | Yes | Parity |
| Conversation threading | Yes | No | We're ahead |
| Reasoning/thinking parts | Yes | No | We're ahead |
| Subagent tracking | Yes | Yes | Parity |
| Redaction | Yes (deep) | No | We're ahead |
| Offline queue + retry | Yes | No | We're ahead |
| Parent span attachment (`CC_PARENT_SPAN_ID`) | No | Yes | **Gap** — RES-689 |
| Experiment linking (`CC_EXPERIMENT_ID`) | No | Yes | **Gap** |
| Bidirectional (query traces from CC) | No | Yes (MCP) | **Gap** — RES-693 |
| Prompt caching tokens | No | Yes | **Gap** — RES-677 |

### vs Langfuse

| Feature | orq | Langfuse | Gap |
|---|---|---|---|
| Hook types used | 8 | 1 (Stop only) | We're ahead |
| Subagent tracking | Yes | No | We're ahead |
| Conversation threading | Yes | No | We're ahead |
| Content truncation (`MAX_CHARS`) | No | Yes (20K default) | **Gap** — RES-684 |
| Trace URL in git commits | No | Yes | **Gap** — RES-692 |
| Self-hostable | N/A (SaaS) | Yes | Different model |
| Token counting | Yes | No | We're ahead |

### vs Datadog

| Feature | orq | Datadog | Gap |
|---|---|---|---|
| Per-session traces | Yes | Yes | Parity |
| Org-wide dashboards | No | Yes | **Gap** (backend/UI) |
| Per-user aggregation | No | Yes | **Gap** — RES-682 |
| Error rate tracking | No | Yes | **Gap** — RES-680 |
| Lines of code changed | No | Yes | **Gap** |
| Model-specific cost breakdown | Yes | Yes | Parity |

### vs disler/multi-agent-observability

| Feature | orq | disler | Gap |
|---|---|---|---|
| Hooks used | 8 | 12 | **Gap** — missing StopFailure, Permission*, PostToolUse |
| Real-time dashboard | No | Yes (WebSocket) | **Gap** (different architecture) |
| Security hooks (block commands) | No | Yes | Out of scope for tracing |
| Live pulse chart | No | Yes | **Gap** (UI feature) |

### vs nexus-labs/agent-observability

| Feature | orq | nexus-labs | Gap |
|---|---|---|---|
| Multi-backend support | No (orq only) | Yes (10 backends) | Different purpose |
| Anti-pattern detection | No | Yes | **Gap** — RES-694 area |
| Framework auto-detection | N/A | Yes | N/A (CC-specific) |
| PII detection warnings | No | Yes | **Gap** |

---

## Roadmap Tickets

### Phase 1 — Quick Wins

| Ticket | Title | Status |
|---|---|---|
| RES-677 | Capture prompt caching tokens | Backlog |
| RES-678 | Add git commit hash to session span | Backlog |
| RES-680 | Add StopFailure hook for API error visibility | Backlog |
| RES-682 | Add user identity to trace spans | Backlog |
| RES-684 | Add content truncation with configurable max length | Backlog |

### Phase 2 — Observability Depth

| Ticket | Title | Status |
|---|---|---|
| RES-686 | Add trace sampling support | Backlog |
| RES-687 | Add custom metadata tags via env var | Backlog |
| RES-688 | Add PermissionRequest/PermissionDenied hooks | Backlog |
| RES-689 | Add parent span attachment for external traces | Backlog |
| RES-690 | Add granular content capture controls | Backlog |

### Phase 3 — Platform Differentiation

| Ticket | Title | Status |
|---|---|---|
| RES-691 | Link sessions to projects via git repo | Backlog |
| RES-692 | Add trace URL to git commits | Backlog |
| RES-693 | Bidirectional trace access from inside CC | Backlog |
| RES-694 | Integrate eval scoring with trace spans | Backlog |

---

## Unused Claude Code Hooks (19 of 27)

| Hook | Potential Use | Priority |
|---|---|---|
| **StopFailure** | API errors, rate limits as error spans | P0 — RES-680 |
| **PostToolUse** | Real-time tool success data | P1 |
| **PermissionRequest** | Tool approval latency tracking | P1 — RES-688 |
| **PermissionDenied** | Auto-mode denial tracking | P1 — RES-688 |
| **PostCompact** | Context size after compaction | P2 |
| **InstructionsLoaded** | CLAUDE.md influence tracking | P2 |
| TaskCreated / TaskCompleted | Task lifecycle spans | P3 |
| WorktreeCreate / WorktreeRemove | Worktree lifecycle | P3 |
| CwdChanged | Directory navigation | P3 |
| FileChanged | External file modifications | P3 |
| ConfigChange | Settings changes | P3 |
| Notification | Notification events | P3 |
| TeammateIdle | Multi-agent coordination | P3 |
| Elicitation / ElicitationResult | MCP user input tracking | P3 |
| PreToolUse | Tool-level sampling/filtering | P3 |

## Backend: How Custom Attributes Become Filterable

The traces-processor has two systems:

1. **Registry** (`registry_handler.go`): Auto-indexes a fixed allowlist of ~35 known attribute keys into Redis for the filter UI. Custom keys outside the allowlist are stored but NOT filterable.

2. **Metadata** (`metadata_handler.go`): Watches for `metadata.*` prefixed attributes on **root spans only**. These are auto-registered in MongoDB and become filterable dimensions in the trace UI.

**To make any custom field filterable**: emit it as `metadata.<key>` on the root session span.
