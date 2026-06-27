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
- local/private reference files under `模板/`
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

Before publishing or pushing changes, run:

```bash
git status --short
git ls-files | rg '\\.(indd|log)$|^模板/|^workspace/B_outputs/|^workspace/C_inputs/|\\.FillReplaceHolder\\.jpg$|_objects\\.json$'
```

The second command should not list files intended for public distribution.
