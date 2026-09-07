# htsh.pl

The source for [htsh.pl](https://htsh.pl) — a personal site styled after 1980s
teletext/Ceefax pages, built with [Eleventy](https://www.11ty.dev/). Blog
posts and projects are markdown files; the rest of the chrome (masthead,
topbar clock, footer nav) is a shared Nunjucks layout.

A few things it does beyond "static site with a retro theme":

- **Page-number navigation** — type a number (e.g. `200`) and hit Enter to
  jump straight to that page, teletext-style. Unmapped numbers land on a
  centered 404.
- **RSS/Atom feeds**, a `sitemap.xml`, and `robots.txt` — all generated from
  the same content, no manual upkeep.
- **Per-page SEO**: unique title/description, canonical URLs, Open
  Graph/Twitter Card tags, and JSON-LD (`Person` on the about page,
  `BlogPosting` on each post).
- Two standalone **CV pages** (`/cv/`, a "modern" version, and `/cv/windows98.html`,
  a Windows 98–styled easter egg) — plain self-contained HTML, untouched by
  the Eleventy build, just passthrough-copied.

## Stack

- [Eleventy](https://www.11ty.dev/) (Nunjucks templates, markdown content)
- Plain CSS/JS — no framework, no bundler
- [ModeSeven](https://departmentofplay.net/experiments/teletext/) font for
  the teletext look
- Docker (multi-stage build → nginx) for the production image
- GitHub Actions for CI/CD (build → push to GHCR → deploy over SSH)

## Project structure

```
src/
  _includes/layouts/   shared Nunjucks layouts (base page shell, post, project, generic page)
  _data/site.js        sitewide metadata (URL, title, description, author)
  blog/*.md            blog posts (front matter: title, date, tags, summary, ...)
  projects/*.md        projects (front matter: title, tech, status, summary, ...)
  index.njk            homepage
  blog.njk             blog index
  projects.njk         projects index
  about.md             about page
  404.njk              not-found page
  feed.njk / atom.njk  RSS / Atom feeds
  sitemap.njk          sitemap.xml
  robots.njk           robots.txt
cv/                    standalone CV pages, passthrough-copied as-is
style.css / script.js  sitewide styles and the clock/keypad-navigation script
.eleventy.js           Eleventy config: collections, filters, passthrough copy
```

## Adding content

A new blog post or project is just a markdown file with front matter —
no HTML editing required. Copy the shape of an existing file in
`src/blog/` or `src/projects/` (page number, date/tech/status, a short
`summary` used for the index and meta description, then the body).

## Local development

```bash
npm install
npm run serve   # http://localhost:8080, live reload
```

Or, without installing Node locally:

```bash
docker compose up   # http://localhost:8280
```

## Production build

```bash
npm run build        # outputs to _site/
docker build -t htsh-vcard .   # multi-stage: node build -> nginx serve
```

`.github/workflows/build-deploy.yml` builds the image, pushes it to the
GitHub Container Registry (`ghcr.io/krzlew/vcard`), and deploys it over SSH
on push to `main`. It uses the built-in `GITHUB_TOKEN` for the registry
push and expects `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`,
`DEPLOY_SSH_KEY`, and `DEPLOY_COMPOSE_DIR` as repo secrets for the SSH step.
`deploy/docker-compose.vcard.yml` is a reference template for the
Traefik-side service block, not something this repo deploys directly.

## Credits

The teletext design is inspired by [mattcrouch.net](https://www.mattcrouch.net/).

## License

MIT — see [LICENSE](LICENSE). That covers the code/template; the personal
content (bio, blog posts, CV, images) is, well, personal.
