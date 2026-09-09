# chained-sdd preset

Local Spec Kit preset (not published to a catalog). Bundles the complete **Chained SDD** workflow methodology:

1. **Autonomy & Spec Kit pipeline principle**: Appends the chained SDD principle onto the core `constitution-template` (`templates/constitution-pipeline.md`).
2. **Enhanced Workflow Skills (`skills/`)**:
   - `speckit-clarify`: Immediate question persistence and default recommendations in `spec.md`.
   - `speckit-analyze`: Persistent `analysis.md` audit report with actionable user-editable remediation checklists.
   - `speckit-implement`: Step 2.5 auto-apply remediation before executing tasks.
   - `speckit-converge`: Automatic ADR extraction into `docs/adr/` and single-file living spec consolidation (`specs/<id>-<name>.md`).

Installed automatically by `speckit-launch`. To add it to an existing Spec Kit project:

```bash
specify preset add --dev /path/to/speckit-launch/presets/chained-sdd
specify preset resolve constitution-template
```

Then run `/speckit-constitution` so the live `.specify/memory/constitution.md` picks up the composed scaffold. Installing the preset does not rewrite an already-filled constitution.
