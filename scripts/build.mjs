#!/usr/bin/env node
// Builds the project catalog into dist/.
// Repositories come from the GitHub API; projects.json adds sections, order, copy and images.
// Usage: GITHUB_TOKEN=... node scripts/build.mjs   (the token is optional, it only raises the rate limit)

import { readFile, writeFile, mkdir, cp, rm, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const config = JSON.parse(await readFile(join(root, "projects.json"), "utf8"));

const repos = await fetchRepos(config.owner);
const projects = await buildProjects(repos, config);
const sections = config.sections
  .map((section) => ({ ...section, projects: projects.filter((p) => p.section === section.id) }))
  .filter((section) => section.projects.length > 0);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(join(root, "src"), dist, { recursive: true, filter: (src) => !src.endsWith(".html") });
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
const template = await readFile(join(root, "src", "index.html"), "utf8");
await writeFile(join(dist, "index.html"), render(template, config, sections));
await writeFile(join(dist, ".nojekyll"), "");

console.log(`Built ${projects.length} projects in ${sections.length} sections into dist/`);

// ---------------------------------------------------------------------------

async function fetchRepos(owner) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "project-catalog-build" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const all = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/users/${owner}/repos?type=owner&per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) return all;
  }
}

async function buildProjects(repos, config) {
  const excluded = new Set(config.exclude.map((name) => name.toLowerCase()));
  const sectionOrder = config.sections.map((s) => s.id);
  const result = [];

  for (const repo of repos) {
    if (repo.private || excluded.has(repo.name.toLowerCase())) continue;
    if (repo.fork && !config.includeForks) continue;

    const extra = config.projects[repo.name] ?? {};
    const isOld = repo.pushed_at < config.archiveBefore;
    const section = extra.section ?? (isOld ? "archive" : config.defaultSection);
    const website =
      extra.website ??
      (repo.homepage || (repo.has_pages ? `https://${config.owner}.github.io/${repo.name}/` : null));

    result.push({
      id: repo.name,
      title: extra.title ?? repo.name,
      summary: extra.summary ?? repo.description ?? "",
      section,
      order: extra.order ?? 1000,
      image: (await usableImage(extra.image)) ?? null,
      imageFit: extra.imageFit ?? "cover",
      icon: extra.icon ?? null,
      language: repo.language,
      stars: repo.stargazers_count,
      created: repo.created_at,
      pushed: repo.pushed_at,
      source: repo.html_url,
      website,
    });
  }

  return result.sort(
    (a, b) =>
      sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) ||
      a.order - b.order ||
      // The archive reads oldest first, everything else most recently updated first.
      (a.section === "archive" ? a.created.localeCompare(b.created) : b.pushed.localeCompare(a.pushed)),
  );
}

// Local images that have not been generated yet are skipped instead of rendering a broken <img>.
async function usableImage(path) {
  if (!path || /^https?:/.test(path)) return path;
  try {
    await access(join(root, path));
    return path;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------

function render(template, config, sections) {
  const projects = sections.flatMap((s) => s.projects);
  const years = projects.flatMap((p) => [p.created, p.pushed]).map((d) => Number(d.slice(0, 4)));
  const span = `${Math.min(...years)}–${Math.max(...years)}`;
  const person = config.person;

  return template
    .replaceAll("{{name}}", esc(person.name))
    .replaceAll("{{intro}}", esc(person.intro))
    .replaceAll("{{count}}", String(projects.length))
    .replaceAll("{{span}}", span)
    .replaceAll("{{built}}", formatDate(new Date().toISOString()))
    .replace("{{links}}", person.links.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join(""))
    .replace("{{pads}}", renderPads(sections))
    .replace("{{legend}}", renderLegend(sections))
    .replace("{{sections}}", sections.map(renderSection).join("\n"));
}

function renderPads(sections) {
  return sections
    .flatMap((section) =>
      section.projects.map(
        (p) =>
          `<li><a class="pad" href="#${anchor(p)}" data-section="${section.id}" title="${esc(p.title)}" data-summary="${esc(p.summary)}">` +
          `<span class="pad-led" aria-hidden="true"></span><span class="pad-label">${esc(p.title)}</span></a></li>`,
      ),
    )
    .join("\n");
}

function renderLegend(sections) {
  return sections
    .map((s) => `<li data-section="${s.id}"><a href="#${s.id}">${esc(s.title)}</a></li>`)
    .join("");
}

function renderSection(section) {
  const body =
    section.layout === "list"
      ? renderList(section.projects)
      : section.layout === "feature"
        ? section.projects.map(renderFeature).join("\n")
        : `<div class="panels">${section.projects.map(renderPanel).join("\n")}</div>`;

  return `
<section class="section section-${section.layout}" id="${section.id}" data-section="${section.id}" aria-labelledby="${section.id}-title">
  <header class="section-head">
    <h2 id="${section.id}-title">${esc(section.title)}</h2>
    <p>${esc(section.intro)}</p>
  </header>
  ${
    section.image
      ? `<div class="with-art"><figure class="section-art"><img src="${esc(section.image)}" alt="" loading="lazy" decoding="async"></figure>${body}</div>`
      : body
  }
</section>`;
}

function renderFeature(p) {
  return `
<article class="feature" id="${anchor(p)}">
  ${figure(p, "feature-media")}
  <div class="feature-text">
    <h3>${p.icon ? `<img class="icon" src="${esc(p.icon)}" alt="" width="40" height="40">` : ""}${esc(p.title)}</h3>
    <p class="summary">${esc(p.summary)}</p>
    ${meta(p)}
    ${actions(p)}
  </div>
</article>`;
}

function renderPanel(p) {
  return `
<article class="panel" id="${anchor(p)}">
  ${figure(p, "panel-media")}
  <h3>${esc(p.title)}</h3>
  <p class="summary">${esc(p.summary)}</p>
  ${meta(p)}
  ${actions(p)}
</article>`;
}

function renderList(projects) {
  const rows = projects
    .map(
      (p) => `
    <li id="${anchor(p)}">
      <span class="year">${p.created.slice(0, 4)}</span>
      <a class="name" href="${esc(p.source)}">${esc(p.title)}</a>
      <span class="what">${esc(p.summary) || "&#8203;"}</span>
      <span class="lang">${esc(p.language ?? "")}</span>
    </li>`,
    )
    .join("");
  return `<ol class="archive">${rows}</ol>`;
}

function figure(p, cls) {
  if (!p.image) return `<div class="${cls} ${cls}-empty" aria-hidden="true"></div>`;
  return `<figure class="${cls} fit-${p.imageFit}"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></figure>`;
}

function meta(p) {
  const parts = [];
  if (p.language) parts.push(`<li>${esc(p.language)}</li>`);
  parts.push(`<li>Updated <time datetime="${p.pushed}">${formatDate(p.pushed)}</time></li>`);
  if (p.stars > 0) parts.push(`<li>${p.stars} ${p.stars === 1 ? "star" : "stars"}</li>`);
  return `<ul class="meta">${parts.join("")}</ul>`;
}

function actions(p) {
  const links = [];
  if (p.website) links.push(`<a class="button primary" href="${esc(p.website)}">Open website</a>`);
  links.push(`<a class="button" href="${esc(p.source)}">Source code</a>`);
  return `<p class="actions">${links.join("")}</p>`;
}

function anchor(p) {
  return `p-${p.id.toLowerCase()}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
