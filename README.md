# Orq Claude Code Plugins

This repo contains independently installable Claude Code plugins for Orq.

## Plugins

### [`trace-hooks`](./trace-hooks)

OTLP tracing hooks that export Claude Code sessions, turns, tool calls, and LLM responses to Orq Traces.

```bash
claude plugin install @orq-ai/claude-trace-hooks
```

### [`mcp`](./mcp)

Orq MCP server — gives Claude Code access to Orq platform tools.

```bash
claude plugin install @orq-ai/claude-mcp
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

## Development

Test plugins locally:

```bash
# Test trace hooks
claude --plugin-dir ./trace-hooks

# Test MCP
claude --plugin-dir ./mcp

# Test both
claude --plugin-dir ./trace-hooks --plugin-dir ./mcp
```
