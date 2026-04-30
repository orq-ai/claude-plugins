# Orq Claude Plugins

> **⚠️ End of Life — May 2026**
>
> This repository is deprecated and will reach end of life at the end of May 2026.
> Active development has moved to [orq-ai/assistant-plugins](https://github.com/orq-ai/assistant-plugins). Please migrate there.

This repo is a compatibility shim. It exposes the same Claude Code marketplace entry point (`orq-claude-plugin`) but proxies all plugin content from [orq-ai/assistant-plugins](https://github.com/orq-ai/assistant-plugins) via a git submodule at `vendor/assistant-plugins`.

Existing installs continue to work without changes. New installs should use `orq-ai/assistant-plugins` directly.

## How it works

`marketplace.json` maps each plugin to a path inside the submodule:

| Plugin | Source |
|--------|--------|
| `orq-trace` | `vendor/assistant-plugins/plugins/trace-hooks` |
| `orq-mcp` | `vendor/assistant-plugins` |
| `orq-skills` | `vendor/assistant-plugins` |

## Migrate to assistant-plugins

```bash
# Remove old marketplace entry
claude plugin marketplace remove orq-claude-plugin

# Add new one
claude plugin marketplace add orq-ai/assistant-plugins

# Reinstall plugins
claude plugin install orq-trace@assistant-plugins
claude plugin install orq-mcp@assistant-plugins
claude plugin install orq-skills@assistant-plugins
```

## Keeping the submodule current

```bash
git submodule update --remote vendor/assistant-plugins
git add vendor/assistant-plugins && git commit -m "chore: bump assistant-plugins submodule"
```

## License

[MIT](./LICENSE)
