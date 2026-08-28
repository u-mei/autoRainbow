# autoRainbow

autoRainbow is a local InDesign automation tool for parsing document/image inputs,
editing the generated content queue in a browser UI, and dispatching layout jobs to
Adobe InDesign.

## License

Project source code is licensed under AGPL-3.0-only. See `LICENSE`.

The web UI style references Animal Island UI, whose upstream license is Creative
Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0). See
`THIRD_PARTY_NOTICES.md`.

The bundled SweiGothicCJKsc font files are licensed under the SIL Open Font
License 1.1.

## What Is Not Included

This repository intentionally does not store:

- `.indd` InDesign templates or generated `.indd` output files
- internal/private content under `private/` (internal docs, build scripts,
  release tooling) and per-template `style_profile.json` data
- local/private font binaries other than the bundled open-source SweiGothicCJKsc
  files
- local input/output queues, logs, caches, template parser caches, and generated
  artifacts
- personal machine configuration

Personal configuration means data that only makes sense on one developer's
machine, such as local project paths, InDesign application paths, UI state, queue
state, recently imported files, local Agent state, and local Claude/Codex tool
permissions.

## Requirements

- Python 3.9+
- Adobe InDesign installed locally
- macOS for AppleScript-based InDesign automation, or Windows for the Python
  Agent/browser UI paths that do not depend on AppleScript
- Valid local InDesign templates placed under `workspace/A_templates/`

## Run Locally

macOS:

```bash
./AutoRainbow.command
```

Windows:

```bat
AutoRainbow.bat
```

Then open:

```text
http://127.0.0.1:8800
```

## Workspace Notes

The `workspace/` directory is treated as local runtime data. The repository may
contain small template metadata files used by tests or development, but InDesign
template binaries, template parser caches, outputs, queues, logs, and user inputs
are ignored by Git.

Internal/private files (`private/`, template profiles) are tracked in the
development repository (`main`/`dev`) but excluded from the public release by
`private/release_to_public.py` (internal-only, not published). Before publishing,
generate a snapshot to a scratch branch and verify nothing private is included:

```bash
python3 private/release_to_public.py --src main --target release-check
git ls-tree -r --name-only release-check | rg 'private/|\.indd$|style_profile'
# 应无输出（或仅公开工具文件名）；确认后删除该临时分支
```
