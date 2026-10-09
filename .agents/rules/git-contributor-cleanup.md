# Git Contributor Management & Cleanup Guidelines

## 1. Prevention Guidelines
- **No Co-Author Trailers**: Never append `Co-Authored-By:` trailers (especially for AI agents or automated bots like Claude, Gemini, Copilot) to commit messages unless explicitly requested by the user.
- **Maintain Correct Authorship**: All commits in this repository must use the user's verified identity:
  - Name: `Sujan`
  - Email: `sujannaik1607@gmail.com`

---

## 2. Procedure: Removing Unwanted Contributors from GitHub

When an unwanted contributor appears on the repository (due to past commit authorship or `Co-Authored-By` trailers):

### Phase 1: Locate and Clean Commit History
1. Search the git log for references to the unwanted author/trailer:
   ```bash
   git log --all --grep="<unwanted_term>" --oneline
   git log --all --author="<unwanted_term>" --oneline
   ```
2. Rewrite the affected commits to remove the trailer/author:
   - Can use non-interactive branch cherry-pick or interactive rebase.
   - Commit cleanly with `--author="Sujan <sujannaik1607@gmail.com>"`.
3. Verify the git log is 100% clean:
   ```bash
   git log --all --grep="Co-Authored-By" --oneline
   ```

### Phase 2: Force-Push and Delete Remote Branches
1. Force-push the rewritten branch to remote:
   ```bash
   git push --force origin main
   ```
2. Delete any merged remote feature branches holding old commit references:
   ```bash
   git push origin --delete <branch_name>
   ```

### Phase 3: Force GitHub Cache Invalidation (Instant Flush)
GitHub caches contributor statistics and associates them with the default branch. Pushing alone can take up to 24 hours to update the UI. To force an immediate purge and re-index:
1. Temporarily rename the default branch (e.g. `main` -> `main-temp`) via the GitHub API or repository settings:
   - API: `POST /repos/:owner/:repo/branches/main/rename` with `{"new_name": "main-temp"}`
2. Wait a few seconds, then rename it back to `main`:
   - API: `POST /repos/:owner/:repo/branches/main-temp/rename` with `{"new_name": "main"}`
3. Re-link local tracking:
   ```bash
   git fetch origin
   git branch --set-upstream-to=origin/main main
   ```
4. This completely wipes GitHub's stale contributor index and forces an immediate recalculation from the clean commit tree.
