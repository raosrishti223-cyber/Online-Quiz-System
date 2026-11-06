# Sprint 2 setup and scope

## Run locally

Requires Node.js 20 or later. No third-party packages or MySQL server are required.

In PowerShell, open this folder and set administrator credentials for the current terminal:

```powershell
$env:QUIZ_ADMIN_USERNAME = "admin"
$env:QUIZ_ADMIN_PASSWORD = Read-Host "Choose a local admin password"
npm.cmd install
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000). The default quiz page links to the administrator sign-in page. The server will reject admin sign-in until both environment variables are set. These values are not stored in the repository. Use a unique password and do not expose this development server to the public internet.

Run automated tests in another terminal:

```powershell
npm.cmd test
```

## Question and score storage

The backend creates `backend/data/questions.json` from the sample questions on first use and atomically saves administrator changes there. That runtime data directory is ignored by Git. Quiz answers and scores are calculated on the server at submission time; correct answers are not returned by the participant question endpoint. Administrator sessions expire after eight hours and are held in memory, so a server restart signs administrators out.

`database/schema.sql` remains a MySQL migration scaffold. Sprint 2 uses the built-in Node.js file store so the demo runs without installing or configuring a database. This is a documented implementation deviation, not a MySQL integration.

## Sprint 2 implementation ownership

The original GitHub issue assignments remain unchanged:

| Issue | Feature | Assigned member |
|---|---|---|
| #7 | Calculate Score | Shwetha |
| #8 | Display Result | Shwetha |
| #10 | Administrator Login | Sharvari |
| #11 | Add Question | Pratistha |
| #12 | Edit Question | Sharvari |
| #13 | Delete Question | Sharvari |
| #14 | View Questions | Srishti |

Implementation was completed in this shared workspace with AI assistance. This does not claim that any assigned member authored or reviewed the changes. The assigned members should review their feature areas and coordinate the Sprint 2 pull request with the repository owner.

## GitHub Actions note

The supplied workflow is inside this project folder at `.github/workflows/ci.yml`. GitHub Actions only discovers workflow files under the repository-root `.github/workflows/` directory. When this project is committed as a subfolder, place or copy the workflow at the repository root if you want GitHub to run it automatically; `npm.cmd test` can be run locally in the meantime.
