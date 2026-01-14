# Finance-Tracker-1

Simple static Income & Expense tracker (Vanilla JS) using Firebase Auth + Firestore.

This repo is ready to be published as a static site (GitHub Pages). Below are a quick deploy checklist and a recommended GitHub Actions workflow.

## Quick deploy checklist

- Confirm files are at repository root: `index.html`, `app.js`, `style.css`.
- Verify `app.js` has the correct Firebase config values (apiKey, projectId, authDomain, storageBucket, etc.).
  - Client Firebase `apiKey` is expected to be public. Protect data with Firestore security rules.
- Enable Email/Password sign-in in Firebase Console (Authentication → Sign-in method).
- Ensure Firestore security rules allow authenticated users to read/write their own documents. Test locally in browser and check console errors.
- When using queries with multiple `orderBy`/`where` clauses, Firestore may require composite indexes; follow any console-provided index creation links.
- Confirm `storageBucket` string in `app.js` matches the exact value from Firebase Console to avoid storage init errors (even if storage is unused).
- Check `index.html` references are correct for your repo layout. If you host under a path (e.g., `https://username.github.io/repo/`), either:
  - Put files in the `docs/` folder and set GitHub Pages source to `docs/` on `main`, or
  - Use the GitHub Actions workflow below that deploys built files to Pages (recommended).
- Test in a modern browser (ES modules are used via `type="module"`).
- Update UI copy if desired — footer currently mentions `localStorage` although the app uses Firestore + IndexedDB persistence.

## Deploy options

1) GitHub Pages (source = `main` / `docs/`)
   - Move files into `docs/` or change Pages source to `main` root.
   - Commit & push. Enable GitHub Pages in repo settings.

2) GitHub Pages with Actions (recommended — automatic on push to `main`)
   - Use the workflow file `.github/workflows/deploy-pages.yml` (provided).
   - The workflow uploads the repository root as the Pages artifact and deploys it.

## Files added by this repo update

- `.github/workflows/deploy-pages.yml` — GitHub Actions workflow to deploy on push to `main`.

## Post-deploy checks

- Open the site and test sign-in/register flows.
- Check browser console for Firestore errors (missing index, permission denied, wrong config).
- Create and delete categories/transactions to validate rules.

## Security notes

- Firebase client config (apiKey, projectId, etc.) is safe to include in static apps; it is not a secret. Use strict Firestore rules to protect user data.

---

If you want, I can also:
- Update the footer copy in `index.html` to correctly mention Firestore.
- Configure the repo to build from a `docs/` folder instead of root.
- Add a `CNAME` file if you plan to use a custom domain.

Tell me which of these you want next.