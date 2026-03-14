# Claude Code Plugins

## Reinstalling the trace plugin during development

Symlinks don't work — the plugin system overwrites them with a copy. To reinstall from source:

```bash
rm -rf ~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0
mkdir -p ~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0
cp -r plugins/trace-hooks/* ~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0/
cp -r plugins/trace-hooks/.claude-plugin ~/.claude/plugins/cache/orq-claude-plugin/orq-trace/0.1.0/
```

Then restart Claude Code for changes to take effect.

## Checking traces with the orq CLI

Always prefer the `orq` CLI over MCP tools for inspecting traces and spans. Use `orq config use prod-claude-code` to switch to the production Claude Code workspace, then `orq trace list`, `orq trace span list <trace-id>`, `orq trace span get <trace-id> <span-id>`. Use `--json` flag for full details.

## Trace plugin configuration

The trace hook resolves API key and base URL using this priority chain:

1. **Environment variables** — `ORQ_API_KEY` and `ORQ_BASE_URL` (highest priority)
2. **`ORQ_PROFILE` env var** — names a profile in `~/.config/orq/config.json`
3. **orq CLI current profile** — whatever `orq config use <name>` is set to

If none are set, the hook defaults to `https://my.orq.ai` with no API key.

Note: the `env` field in `~/.claude/settings.local.json` only applies to MCP servers, not hooks. Environment variables must be set in your shell (e.g. `~/.zshrc`).

To send traces to a different workspace, either run `orq config use <profile>` or launch Claude Code with `ORQ_PROFILE=staging-research claude`.

The OTLP endpoint can still be overridden directly with `OTEL_EXPORTER_OTLP_ENDPOINT`, and extra headers with `OTEL_EXPORTER_OTLP_HEADERS`.
