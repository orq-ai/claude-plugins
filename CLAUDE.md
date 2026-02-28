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

Use `orq config use prod-claude-code` to switch to the production Claude Code workspace, then `orq trace list`, `orq trace span list <trace-id>`, `orq trace span get <trace-id> <span-id>`.

## Environment variables for the trace plugin

`ORQ_API_KEY` must be set as a real shell environment variable (e.g. in `~/.zshrc`). The `env` field in `~/.claude/settings.local.json` only applies to MCP servers, not hooks.
