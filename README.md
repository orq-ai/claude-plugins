# Orq Claude Plugins

Orq plugins for Claude — tracing, MCP tools, and agent skills. Works with Claude Code, Claude Desktop, and Claude Cowork.

## Claude Desktop (non-technical setup)

If you're using the **Claude Desktop app** (not the terminal), see the [Desktop Setup Guide](./plugins/mcp/DESKTOP_SETUP.md) — no command line needed.

The short version: add this to your `claude_desktop_config.json` (see the guide for where to find it):

```json
{
  "mcpServers": {
    "orq": {
      "type": "http",
      "url": "https://my.orq.ai/v2/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_ORQ_API_KEY_HERE"
      }
    }
  }
}
```

## Claude Code Installation

```bash
# Add the marketplace
claude plugin marketplace add orq-ai/claude-plugins

# Install whichever plugins you need
claude plugin install orq-trace@orq-claude-plugin
claude plugin install orq-mcp@orq-claude-plugin
claude plugin install orq-skills@orq-claude-plugin
```

## Configuration

### API key

Both the tracing and MCP plugins require an orq.ai API key. Set `ORQ_API_KEY` in your shell, `.env` file, or as a command prefix:

```bash
ORQ_API_KEY=sk-... claude
```

### Trace plugin variables

| Variable | Description |
|---|---|
| `ORQ_TRACE_PROFILE` | Orqi profile for trace destination (**highest priority** — decouples traces from CLI/MCP) |
| `ORQ_API_KEY` | API key (used if no trace profile is set) |
| `ORQ_BASE_URL` | Orq API base URL (default: `https://my.orq.ai`) |
| `ORQ_TRACE_USER` | User identity attached to traces (falls back to `git config user.email`) |
| `ORQ_TRACE_MAX_CONTENT_LEN` | Truncate content exceeding this character limit |
| `TRACE_ORQ_REDACT_CONTENT` | Strip all input/output bodies from traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Override the OTLP endpoint directly |
| `OTEL_EXPORTER_OTLP_HEADERS` | Extra headers for the OTLP endpoint |
| `ORQ_DEBUG` | Enable debug logging to stderr (`true`/`1`) |

Tracing auto-enables when an API key can be resolved (via `ORQ_TRACE_PROFILE`, `ORQ_API_KEY`, or orqi CLI profile).

See [`plugins/trace-hooks/README.md`](./plugins/trace-hooks/README.md) for the full configuration reference.

## Plugins

### [`orq-trace`](./plugins/trace-hooks)

Automatically trace Claude Code sessions to Orq. Captures sessions, turns, tool calls, and LLM responses as hierarchical OTLP spans sent to `/v2/otel/v1/traces`.

Span tree:

```
orq.claude_code.session
├── claude_code.turn.1
│   ├── chat claude-opus-4-6
│   ├── execute_tool Read
│   ├── chat claude-opus-4-6
│   ├── execute_tool Edit
│   └── subagent.Explore
├── claude_code.turn.2
│   └── ...
```

### [`orq-mcp`](./plugins/mcp)

Orq MCP server — gives Claude Code access to Orq platform tools via `https://my.orq.ai/v2/mcp`.

### [`orq-skills`](./plugins/skills) (submodule → [orq-ai/orq-skills](https://github.com/orq-ai/orq-skills))

Agent skills for the Build → Evaluate → Optimize lifecycle on orq.ai. Includes:

- **Skills** — build-agent, build-evaluator, run-experiment, optimize-prompt, analyze-trace-failures, generate-synthetic-dataset, prompt-learning
- **Commands** — `/orq:quickstart`, `/orq:invoke`, `/orq:workspace`, `/orq:traces`, `/orq:analytics`, `/orq:models`

See the [orq-skills README](https://github.com/orq-ai/orq-skills) for full documentation.

## Development

Test plugins locally:

```bash
claude --plugin-dir ./plugins/trace-hooks
claude --plugin-dir ./plugins/mcp
claude --plugin-dir ./plugins/skills
```

## Updating

After making changes, bump the version in both `marketplace.json` and the relevant `plugin.json`, then push. Users update with:

```bash
claude plugin marketplace update orq-claude-plugin
```

To update the skills submodule to the latest upstream:

```bash
git submodule update --remote plugins/skills
```

## License

[MIT](./LICENSE)
