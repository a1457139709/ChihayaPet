# Issue tracker: GitHub

Issues and specs live in [a1457139709/ChihayaPet](https://github.com/a1457139709/ChihayaPet/issues). Use the `gh` CLI, run from this checkout or with `--repo a1457139709/ChihayaPet`.

## Conventions

- Create: `gh issue create --title "..." --body-file <file>`; preserve actual newlines in multiline Markdown.
- Read: `gh issue view <number> --comments`; include labels and reporter context.
- List: `gh issue list --state open --json number,title,body,labels,comments`, with the relevant state and label filters.
- Update: `gh issue edit <number> --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- Close: `gh issue close <number> --reason completed`, after recording the evidence that satisfies the issue's scope.

Infer the repository from `git remote -v`. When a skill says "publish to the issue tracker", create a GitHub issue. When it says "fetch the relevant ticket", read the issue and its comments.

## Parent issues and sub-issues

Use GitHub's native parent/sub-issue relationship. Add a child with `gh api --method POST repos/a1457139709/ChihayaPet/issues/<parent>/sub_issues -F sub_issue_id=<child-database-id>`; use the numeric database `id`, not the issue number or GraphQL `node_id`.

Keep a linked task list in the parent for scanning and a `Part of #<parent>` reference in each child. If native relationships are unavailable, retain these links and explicitly record the limitation.

## Art progress and completion evidence

For the tea-pose work, use `docs/plans/2026-09-30-native-tea-and-original-faces.md` and the per-view records embedded in `docs/reports/chihaya-character-progress.html`; the underlying data lives in `ArtSources/CharacterExpansion/native-tea/progress.json`.

Close a mother-image production/review child only when that view has a real image at the required canvas size, passed pixel checks and an explicit recorded human approval. Record the image, production evidence and approval message in the issue. Original-face-fit review, saved composite PNG exports and application integration retain their own recorded status.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set to `yes` if external PRs should enter the triage queue.

GitHub shares issue and PR numbers. Resolve an ambiguous number with `gh pr view <number>` and fall back to `gh issue view <number>`.
