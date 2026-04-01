# Questions for Manual Resolution

## Git Push Authentication
**Date:** 2026-04-01
**Updated:** 2026-04-01 13:02

Git push failed with authentication error:
```
fatal: could not read Username for 'https://github.com': No such device or address
```

**Attempted:** `git push --set-upstream origin master`

**Remote:** https://github.com/cletcher/chaprola-fitlog.git

**Status:** Commit `efd9cf1` (Fix auth headers in index.html dashboard) is committed locally but not pushed to remote.

**All inbox tasks are COMPLETE** - only the git push is blocked.

**Investigation results:**
- No SSH keys found in ~/.ssh/
- No git credential helper configured
- Remote uses HTTPS (https://github.com/cletcher/chaprola-fitlog.git)

**Resolution needed:**
Option 1: Configure git credentials: `git config credential.helper store` then retry push
Option 2: Add SSH key to GitHub and change remote to SSH: `git remote set-url origin git@github.com:cletcher/chaprola-fitlog.git`
Option 3: Use GitHub CLI: `gh auth login` then retry push

Then run: `git push -u origin master`
