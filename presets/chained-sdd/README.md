# chained-sdd preset

Local Spec Kit preset (not published to a catalog). Appends the **Autonomy & Spec Kit pipeline** principle onto the core `constitution-template`. Does not wrap `/speckit-*` commands.

Installed automatically by `speckit-launch`. To add it to an existing Spec Kit project:

```bash
specify preset add --dev /path/to/speckit-launch/presets/chained-sdd
specify preset resolve constitution-template
```

Then run `/speckit-constitution` so the live `.specify/memory/constitution.md` picks up the composed scaffold. Installing the preset does not rewrite an already-filled constitution.
