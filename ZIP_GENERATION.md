# ORQ Plugin Zip Generation

## Context

The `orq-mcp.zip` file is the distributable package for the ORQ Claude Code plugin. It is uploaded manually to the Claude plugin marketplace when the plugin is updated.

## What the zip contains

The zip packages the contents of `plugins/mcp/` and preserves the directory structure expected by the Claude plugin installer:

```
plugins/mcp/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── AGENTS.md
├── commands/
│   ├── analytics.md
│   ├── invoke.md
│   ├── models.md
│   ├── quickstart.md
│   ├── traces.md
│   └── workspace.md
├── skills/
│   ├── analyze-trace-failures/SKILL.md
│   ├── build-agent/
│   │   ├── resources/
│   │   │   ├── system-instruction-template.md
│   │   │   └── tool-description-guide.md
│   │   └── SKILL.md
│   ├── build-evaluator/
│   │   ├── resources/
│   │   │   ├── data-split-guide.md
│   │   │   ├── judge-prompt-template.md
│   │   │   └── validation-checklist.md
│   │   └── SKILL.md
│   ├── generate-synthetic-dataset/SKILL.md
│   ├── optimize-prompt/SKILL.md
│   ├── prompt-learning/SKILL.md
│   └── run-experiment/SKILL.md
├── .mcp.json
├── claude_desktop_config.json
└── DESKTOP_SETUP.md
```

## Generating the zip

From the repository root, run:

```bash
cd /path/to/claude-plugins
zip -r orq-mcp.zip plugins/mcp/
```

Or use the provided script:

```bash
./scripts/build-plugin-zip.sh
```

## When to regenerate

Regenerate `orq-mcp.zip` whenever any file under `plugins/mcp/` is added, updated, or removed. After regenerating, upload the new zip to the Claude plugin marketplace manually.

## Notes

- The zip is committed to the repository as a convenience artifact for manual upload.
- Do not include `plugins/mcp/orq-mcp.zip` (a nested copy that exists locally) in the zip.
