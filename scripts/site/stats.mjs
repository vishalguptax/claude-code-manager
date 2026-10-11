// Live numbers for the site: Marketplace installs, Open VSX downloads, GitHub
// stars and the published version. Fetched at build time only — the site makes
// no requests in the browser, so the numbers sit in the markup (crawlable, no
// layout shift). Every source is independent: one failing keeps its last
// committed value (site-src/stats.json) and never blocks the others.

const PUBLISHER = "vishalguptax";
const NAME = "claude-manager";
const REPO = "vishalguptax/claude-code-manager";

async function marketplace(fetchImpl) {
  const res = await fetchImpl(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        Accept: "application/json;api-version=7.2-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: `${PUBLISHER}.${NAME}` }] }],
        flags: 914, // returns statistics and versions (versions[0] is the latest)
      }),
    },
  );
  if (!res.ok) throw new Error(`marketplace ${res.status}`);
  const ext = (await res.json()).results?.[0]?.extensions?.[0];
  const stat = (name) => ext?.statistics?.find((s) => s.statisticName === name)?.value;
  const installs = stat("install");
  if (typeof installs !== "number") throw new Error("marketplace: no install stat");
  return {
    marketplaceInstalls: Math.round(installs),
    marketplaceVersion: ext.versions?.[0]?.version,
    rating: stat("averagerating"),
    ratingCount: stat("ratingcount"),
  };
}

async function openVsx(fetchImpl) {
  const res = await fetchImpl(`https://open-vsx.org/api/${PUBLISHER}/${NAME}`);
  if (!res.ok) throw new Error(`openvsx ${res.status}`);
  const data = await res.json();
  if (typeof data.downloadCount !== "number") throw new Error("openvsx: no downloadCount");
  return { openVsxDownloads: data.downloadCount, openVsxVersion: data.version };
}

async function github(fetchImpl) {
  const res = await fetchImpl(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const data = await res.json();
  if (typeof data.stargazers_count !== "number") throw new Error("github: no stargazers_count");
  return { stars: data.stargazers_count };
}

/** Compare dotted versions numerically: -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * The version to print: the newer of what the stores publish and what the repo
 * says. A release commit is bumped before it is published, so taking only the
 * store's number would show the old version (and fail the staleness test).
 */
export function pickVersion(...versions) {
  return versions.filter(Boolean).reduce((a, b) => (compareVersions(a, b) >= 0 ? a : b));
}

/**
 * Merge live numbers over the committed fallback. `warn` receives one message
 * per failed source so CI can surface it (`::warning`) on an otherwise green run.
 */
export async function resolveStats({ fallback, fetchImpl = fetch, warn = () => {} }) {
  const out = { ...fallback };
  const sources = [
    ["Marketplace", marketplace],
    ["Open VSX", openVsx],
    ["GitHub", github],
  ];
  const results = await Promise.allSettled(sources.map(([, fn]) => fn(fetchImpl)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      for (const [k, v] of Object.entries(r.value)) if (v !== undefined && v !== null) out[k] = v;
    } else {
      warn(
        `${sources[i][0]} fetch failed (${r.reason?.message ?? r.reason}); keeping the committed value`,
      );
    }
  });
  out.publishedVersion = pickVersion(out.marketplaceVersion, out.openVsxVersion);
  return out;
}

/** Combined downloads shown on the site. Labelled "downloads", never "users". */
export function totalDownloads(stats) {
  return stats.marketplaceInstalls + stats.openVsxDownloads;
}
