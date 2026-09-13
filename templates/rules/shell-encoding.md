# Shell encoding on Windows

## Do

- Edit UTF-8 docs that contain non-ASCII text (especially [`CHANGELOG.md`](CHANGELOG.md), `docs/**/*.md`, `.agents/**`) **only with the editor tool** (ApplyPatch / StrReplace / Write). Do not overwrite the whole file from the shell.
- A commit message may use a PowerShell here-string (`$msg = @"..."@`). Prefer ASCII or short English when the terminal encoding is uncertain.
- If a PowerShell script must read or write a UTF-8 text file, set the encoding explicitly, for example:
  - `Get-Content -Path $p -Encoding utf8`
  - `Set-Content -Path $p -Value $text -Encoding utf8`
- Prefer Git Bash or WSL for `sed` / heredoc edits of non-ASCII docs. The default terminal may stay PowerShell.

## Do not

- Do not pipe Windows PowerShell 5.x `Get-Content` / `Set-Content` (no `-Encoding`) over a UTF-8 file with non-ASCII text — it is rewritten as the system ANSI code page.
- Do not use `(Get-Content … -Raw).Replace(…) | Set-Content …` to edit CHANGELOG. Replace the single line with the editor tool.
- Do not change git `core.quotepath` or global `i18n.commitEncoding` just to dodge encoding (unless the user explicitly asks).
