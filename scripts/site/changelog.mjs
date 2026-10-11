// Renders CHANGELOG.md into the /changelog/ page body. Handles exactly the
// Markdown the release skill writes: "## [x.y.z] - date" headings, paragraphs,
// "###" subheadings, "- " bullets with indented continuation lines, and inline
// `code`, **bold** and [links](…). Anything richer would be a reason to add a
// real Markdown parser — not to grow this one.

import { esc } from "./html.mjs";

const REPO_BLOB = "https://github.com/vishalguptax/claude-code-manager/blob/main/";

function inline(text) {
  // Escape first, then re-introduce the three inline constructs we support.
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const url = /^https?:/.test(href) ? href : REPO_BLOB + href.replace(/^\.\//, "");
      return `<a href="${url}">${label}</a>`;
    });
}

/** Parse into releases: [{ version, date, blocks: [{type, text|items}] }]. */
export function parseChangelog(md) {
  const releases = [];
  let current = null;
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length && current) current.blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list && current) current.blocks.push({ type: "ul", items: list });
    list = null;
  };

  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const rel = line.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
    if (rel) {
      flushPara();
      flushList();
      current = { version: rel[1], date: rel[2] ?? "", blocks: [] };
      releases.push(current);
      continue;
    }
    if (!current) continue;
    if (/^### /.test(line)) {
      flushPara();
      flushList();
      current.blocks.push({ type: "h3", text: line.slice(4) });
    } else if (/^- /.test(line)) {
      flushPara();
      list ??= [];
      list.push(line.slice(2));
    } else if (/^\s+\S/.test(line) && list) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else if (line === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return releases;
}

/** HTML for the changelog page body: one <article> per release. */
export function renderChangelog(md) {
  return parseChangelog(md)
    .map((r) => {
      const id = `v${r.version.replace(/[^\w.-]/g, "")}`;
      const body = r.blocks
        .map((b) => {
          if (b.type === "p") return `<p>${inline(b.text)}</p>`;
          if (b.type === "h3") return `<h3>${inline(b.text)}</h3>`;
          return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
        })
        .join("\n");
      const date = r.date ? `<time datetime="${r.date}">${r.date}</time>` : "";
      return `<article class="release" id="${id}">
<header class="release-head"><h2><a href="#${id}">${esc(r.version)}</a></h2>${date}</header>
<div class="release-body">${body}</div>
</article>`;
    })
    .join("\n");
}

/** Date of the newest release, for the page's lastmod. */
export function latestReleaseDate(md) {
  return parseChangelog(md).find((r) => r.date)?.date ?? "";
}
