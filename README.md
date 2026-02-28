# Orq Claude Code Plugins

This repo contains independently installable Claude Code plugins for Orq.

## Installation

```bash
# Add the marketplace
/plugin marketplace add orq-ai/claude-plugins

# Install whichever plugins you need
/plugin install orq-trace@orq-plugins
/plugin install orq-mcp@orq-plugins
```

## Plugins

### [`orq-trace`](./plugins/trace-hooks)

OTLP tracing hooks that export Claude Code sessions, turns, tool calls, and LLM responses to Orq Traces.

### [`orq-mcp`](./plugins/mcp)

Orq MCP server — gives Claude Code access to Orq platform tools.

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
claude --plugin-dir ./plugins/trace-hooks

# Test MCP
claude --plugin-dir ./plugins/mcp

# Test both
claude --plugin-dir ./plugins/trace-hooks --plugin-dir ./plugins/mcp
```
