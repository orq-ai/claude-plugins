# Orq Claude Code Plugins

Orq plugins for Claude Code — tracing and MCP tools.

## Installation

```bash
# Add the marketplace
claude plugin marketplace add orq-ai/claude-plugins

# Install whichever plugins you need
claude plugin install orq-trace@orq-claude-plugin
claude plugin install orq-mcp@orq-claude-plugin
```

## Configuration

Both plugins require `ORQ_API_KEY`. Set it in `.claude/settings.local.json`:

```json
{
  "env": {
    "ORQ_API_KEY": "sk-..."
  }
}
```

For the tracing plugin, you can also set:

| Variable | Description |
|---|---|
| `TRACE_TO_ORQ` | Explicitly enable tracing (`true`/`1`) |
| `ORQ_BASE_URL` | Orq API base URL (default: `https://api.orq.ai`) |
| `TRACE_ORQ_REDACT_CONTENT` | Strip all input/output bodies from traces |
| `ORQ_DISABLE_TRACING` | Force-disable tracing (`true`/`1`) |

Tracing auto-enables when `ORQ_API_KEY` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Plugins

### [`orq-trace`](./plugins/trace-hooks)

Automatically trace Claude Code sessions to Orq. Captures sessions, turns, tool calls, and LLM responses as hierarchical OTLP spans sent to `/v2/otel/v1/traces`.

Span tree:

```
orq.claude_code.session
├── claude.turn.1
│   ├── tool.Read
│   ├── tool.Edit
│   ├── claude-sonnet-4-20250514.response
│   └── subagent.Explore
├── claude.turn.2
│   └── ...
```

### [`orq-mcp`](./plugins/mcp)

Orq MCP server — gives Claude Code access to Orq platform tools via `https://my.orq.ai/v2/mcp`.

## Development

Test plugins locally:

```bash
claude --plugin-dir ./plugins/trace-hooks
claude --plugin-dir ./plugins/mcp
```

## Updating

After making changes, bump the version in both `marketplace.json` and the relevant `plugin.json`, then push. Users update with:

```bash
claude plugin marketplace update orq-claude-plugin
```
