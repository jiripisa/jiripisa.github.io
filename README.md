# jiripisa.github.io

The catalog of my projects at <https://jiripisa.github.io/>.

The list of projects comes from my public GitHub repositories. A GitHub Actions workflow rebuilds
the page on every push to `main` and once a day, so a new repository appears without any change here.

## Editing the catalog

Everything that is not in GitHub lives in [`projects.json`](projects.json):

| Key | What it does |
|---|---|
| `person` | Name, introduction and links in the page header. |
| `exclude` | Repositories that never appear on the page. |
| `includeForks` | Whether forks are listed (off by default). |
| `onlyWithPages` | List only repositories that have a GitHub Pages site. |
| `archiveBefore` | Repositories last pushed before this date go to the archive section. |
| `defaultSection` | Section for new repositories that `projects` does not mention. |
| `sections` | Section order, titles, introductions and layout (`feature`, `panel` or `list`). |
| `projects.<repo>` | Per repository: `section`, `order`, `title`, `summary`, `image`, `imageFit`, `icon`, `website`. |

Without an entry in `projects`, a repository uses its GitHub description, its GitHub Pages site
or homepage as the website link, and no picture.

Pictures in `assets/art/` were generated with Codex. A local image path that does not exist is
skipped, so a project can reference its artwork before the file is added.

## Building locally

```bash
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
python3 -m http.server -d dist 8000
```

The token is optional; without it the GitHub API allows 60 requests an hour.
Requires Node.js 22 or later, no packages to install.
