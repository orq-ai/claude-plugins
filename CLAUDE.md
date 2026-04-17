# Claude Code Plugins

## Plugin runtime locations

Claude Code loads plugin hooks from **`~/.claude/plugins/marketplaces/<marketplace>/`**, NOT from `~/.claude/plugins/cache/`. The cache is used for MCP servers and skills only.

For development, symlink the marketplace to your local clone so edits take effect immediately:

```bash
rm -rf ~/.claude/plugins/marketplaces/orq-claude-plugin
ln -s ~/Developer/orq/claude-plugins ~/.claude/plugins/marketplaces/orq-claude-plugin
```

**Warning**: CC may overwrite the symlink on marketplace sync. If hooks stop working after a CC update, re-create the symlink.

## Checking traces with the orqi CLI

**Important**: The internal CLI is `orqi` (not `orq`). `orq` is the public orq CLI with different functionality.

Always prefer `orqi` over MCP tools for inspecting traces and spans. Use `orqi profile set prod-claude-code` to switch to the production Claude Code workspace, then `orqi trace list`, `orqi trace span list <trace-id>`, `orqi trace span get <trace-id> <span-id>`. Use `--json` flag for full details.

## Trace plugin configuration

The trace hook resolves API key and base URL using this priority chain:

1. **Environment variables** — `ORQ_API_KEY` and `ORQ_BASE_URL` (highest priority)
2. **`ORQ_TRACE_PROFILE` env var** — trace-specific profile override
3. **`ORQ_PROFILE` env var** — names a profile in `~/.config/orq/config.json`
4. **orqi CLI current profile** — whatever `orqi profile set <name>` is set to

Tracing is enabled whenever an API key can be resolved. Disable by disabling the plugin in CC settings.

The `env` field in `~/.claude/settings.local.json` only applies to MCP servers, not hooks. Environment variables must be set in your shell (e.g. `~/.zshrc`).

The OTLP endpoint can be overridden with `OTEL_EXPORTER_OTLP_ENDPOINT`, and extra headers with `OTEL_EXPORTER_OTLP_HEADERS`.

## Testing trace hooks

Hooks do NOT fire when running `claude` from inside an existing Claude Code session (CC sets `CLAUDECODE=1` which suppresses hooks in child processes). To test:

```bash
# Unset CLAUDECODE to allow hooks in child processes
env -u CLAUDECODE bash -c 'cd ~/Developer/orq/orq-python && claude -p "list files with ls" 2>&1'
```

### Testing methodology

1. **Simple trace (no tools)**:
   ```bash
   env -u CLAUDECODE bash -c 'cd <repo> && claude -p "say hello" 2>&1'
   ```
   Expected: session span + turn span + 1 LLM response span

2. **Trace with tool calls**:
   ```bash
   env -u CLAUDECODE bash -c 'cd <repo> && claude -p "list files with ls" 2>&1'
   ```
   Expected: session span + turn span + tool spans (Bash) + LLM response spans

3. **Trace with subagents**:
   ```bash
   env -u CLAUDECODE bash -c 'cd <repo> && claude -p "Use the Agent tool to search for files matching *.py" 2>&1'
   ```
   Expected: session span + turn span + Agent tool span + sub-tool spans + LLM responses

4. **Verify traces arrived**:
   ```bash
   orqi profile set prod-claude-code
   orqi trace list --limit 3
   orqi trace span list <trace-id>
   ```

5. **Check span hierarchy**: root `orq.claude_code.session` -> `claude_code.turn.N` -> tool/LLM child spans. Verify token counts, cost, and duration are populated.

6. **Run in parallel across repos** to test different git contexts:
   ```bash
   env -u CLAUDECODE bash -c 'cd ~/Developer/orq/orq-python && claude -p "say hi"' &
   env -u CLAUDECODE bash -c 'cd ~/Developer/orq/orq-smart-router && claude -p "say hi"' &
   wait
   ```

### Plugin cache vs marketplace

Claude Code actually loads hook code from `~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0/`, **not** the marketplace directory. After editing source files, copy them to the cache:

```bash
cp plugins/trace-hooks/src/*.js ~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0/src/
```

### Validation checklist

After sending test traces, validate with `orqi` or MCP tools (`mcp__orq-mcp-global__trace_list`, `trace_span_list`, `trace_span_get`):

| Property | Where to check | Expected |
|---|---|---|
| Span hierarchy | `trace_span_list` | root → turn (agent) → tool + LLM children |
| Root span name | root span | `orq.claude_code.session` |
| Root span type | root span | `trace` |
| Turn span type | turn span | `span.agent` |
| LLM span type | LLM spans | `span.chat_completion` |
| Tool span type | tool spans | `span.agent_tool_execution` |
| `gen_ai.system` | all spans | `anthropic` |
| `gen_ai.request.model` | LLM spans | e.g. `claude-opus-4-6` |
| `gen_ai.response.finish_reasons` | LLM spans | `["end_turn"]` or `["tool_use"]` |
| `gen_ai.input` (conversation) | LLM spans | Accumulated messages including tool results |
| `gen_ai.output` (response) | LLM spans | Messages with `parts` (text, tool_call, reasoning) |
| `gen_ai.tool.name` | tool spans | Tool name (Read, Bash, Edit, etc.) |
| `gen_ai.tool.call.arguments` | tool spans | Tool input JSON |
| `gen_ai.tool.call.result` | tool spans | Tool output content |
| `gen_ai.usage.*` | LLM spans | Non-zero token counts |
| `orq.billing.*` | LLM spans | Cost populated |
| Duration | all spans | Non-zero for LLM spans, non-negative for all |
| Batching | debug log | SessionEnd sends 1 HTTP request (not 3) |
