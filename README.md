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

Both the tracing and MCP plugins require an orq.ai API key. You can provide it in several ways:

- **Environment variable** — set `ORQ_API_KEY` in your shell, `.env` file, or as a command prefix:
  ```bash
  ORQ_API_KEY=sk-... claude
  ```

- **orq CLI profile** — configure a profile with the orq CLI, then either set it as current or reference it by name:
  ```bash
  orq config use my-workspace        # sets as current profile
  ORQ_PROFILE=my-workspace claude    # or reference by name
  ```

The resolution order is: `ORQ_API_KEY` env var → `ORQ_PROFILE` env var → current orq CLI profile.

### Trace plugin variables

| Variable | Description |
|---|---|
| `ORQ_API_KEY` | API key (or use orq CLI profile) |
| `ORQ_BASE_URL` | Orq API base URL (default: `https://my.orq.ai`) |
| `ORQ_PROFILE` | orq CLI profile name to use for API key and base URL |
| `TRACE_TO_ORQ` | Explicitly enable tracing (`true`/`1`) |
| `TRACE_ORQ_REDACT_CONTENT` | Strip all input/output bodies from traces |
| `ORQ_DISABLE_TRACING` | Force-disable tracing (`true`/`1`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Override the OTLP endpoint directly |
| `OTEL_EXPORTER_OTLP_HEADERS` | Extra headers for the OTLP endpoint |

Tracing auto-enables when `ORQ_API_KEY` or `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

Environment variables can be set in your shell (`~/.zshrc`), via a `.env` file, or as a command prefix (`ORQ_BASE_URL=... claude`).

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
