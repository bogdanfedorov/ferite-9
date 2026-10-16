# Ferit-9

Vanilla JS, no bundler, no runtime dependencies. Modules load in order from
`index.html` and talk through globals. Go launcher embeds the whole game.

## Rules

**No comments in code.** Not headers, not inline notes, not commented-out code.
If a block needs explaining, rename things or split the function until it does
not. Enforced by `npm run lint` (`tools/no-comments.js`).

Explanations belong in the README, BUILD.md or the wiki — not in the source.

## Style

- 2-space indent, single quotes, semicolons, LF
- `biome.json` is the source of truth; run `npm run lint:fix` before committing
- inside functions use `let`/`const`; top-level declarations in `js/` stay `var` —
  script-scope `let`/`const` globals cost ~45% in `simulate()` (TDZ checks)
- a global is assigned only in the file that declares it; other files call a
  setter (`setLangHook`, `setSettingsHook`, `toggleHeatView`)
- new player-facing text goes into `js/lang/*.js`, never inline — use
  `t`, `tf`, `tPick`, `tPlural`
