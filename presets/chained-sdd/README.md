# chained-sdd preset

Local Spec Kit preset (not published to a catalog). Bundles the complete **Chained SDD** workflow methodology:

1. **Workflow Overlay (`workflows/chained-sdd.yml`)**:
   - Chained SDD step graph (`specify → clarify → review-clarify [gate] → plan → tasks → analyze → review-analyze [gate] → implement → converge`).
   - Non-destructive interactive review gates with `on_reject: retry`.
2. **Agent Execution Rules (`rules/pipeline-rules.md`, `rules/speckit-pipeline.mdc`)**:
   - `pipeline-rules.md`: Single source of truth for chained SDD execution rules, pause conditions, remediation workflows, and model routing (injected into `.agents/AGENTS.md`).
   - `speckit-pipeline.mdc`: Cursor rule format installed to `.cursor/rules/speckit-pipeline.mdc`.
3. **Autonomy & Spec Kit pipeline principle (`templates/constitution-pipeline.md`)**:
   - Appends the chained SDD principle onto the project `constitution-template`.
4. **Enhanced Workflow Skills (`skills/`)**:
   - `speckit-clarify`: Immediate question persistence and default recommendations in `spec.md`.
   - `speckit-analyze`: Persistent `analysis.md` audit report with actionable user-editable remediation checklists.
   - `speckit-implement`: Step 2.5 auto-apply remediation before executing tasks.
   - `speckit-converge`: Automatic ADR extraction into `docs/adr/` and single-file living spec consolidation (`specs/<id>-<name>.md`).

Installed automatically by `speckit-launch`.

### Standalone Installation (into existing Spec Kit projects)

To install or update the Chained SDD methodology (workflow overlay, enhanced skills, rules, and constitution principle) into an existing Spec Kit project, run:

```bash
node /path/to/speckit-launch/presets/chained-sdd/install.mjs [targetDir]
```

Or via the Spec Kit CLI manually:

```bash
specify preset add --dev /path/to/speckit-launch/presets/chained-sdd
specify preset resolve constitution-template
```

Then run `/speckit-constitution` so the live `.specify/memory/constitution.md` picks up the composed scaffold. Installing the preset does not rewrite an already-filled constitution.
