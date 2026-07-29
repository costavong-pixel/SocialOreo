import { buildReelStructures } from "./reel-structures";
import type { PublicMetrics } from "./public-metrics";

export type AuditReportHtmlInput = {
  profileUrl: string;
  videoCount: number;
  transcriptEnrichmentStatus?: string;
  publicMetrics?: PublicMetrics;
  overallScore: number;
  subScores: Record<string, number>;
  summary: {
    headline?: string;
    diagnosis?: string;
  };
  actionPlan: string[];
  contentPack: {
    strengths?: string[];
    weaknesses?: string[];
    angleRecommendations?: Array<{ angleName: string; reason: string; hook: string }>;
    readyToPostHooks?: string[];
    readyToPostScripts?: string[];
    ctaOptions?: string[];
    captionPack?: string[];
    hashtagPack?: string[];
    contentPrescription?: Array<{ title: string; evidence: string; topic: string; hook: string; first3Seconds: string; shotsOrBeats: string[]; captionDirection: string; cta: string; testSignal: string }>;
  };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderList(items: string[] | undefined): string {
  if (!items?.length) {
    return "<p>None listed.</p>";
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReelStructures(input: AuditReportHtmlInput["contentPack"]): string {
  const recommendations = buildReelStructures(input);

  if (!recommendations.length) {
    return "";
  }

  return `<section>
        <h2>5 repeatable reel structures</h2>
        <p class="callout">Use a format, then make it your own with the execution pack below.</p>
        ${recommendations
          .map(
            (recommendation) => `<h3>${escapeHtml(recommendation.angleName)}</h3>
              <p>${escapeHtml(recommendation.reason)}</p>
              <p><strong>Start with:</strong> ${escapeHtml(recommendation.hook)}</p>`,
          )
          .join("")}
      </section>`;
}

function formatMetric(value: number | undefined): string {
  return value === undefined ? "Unavailable" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
}

function renderPublicMetrics(metrics: PublicMetrics | undefined, transcriptEnrichmentStatus?: string): string {
  if (!metrics) return "";
  const reelEvidence = metrics.reelEvidence?.length
    ? `<h3>Keep, change, or stop</h3><p class="meta">Ranked by public views. Every reel includes one practical next test.</p><ol>${metrics.reelEvidence.map((item) => `<li class="reel">${item.thumbnailUrl ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="Public reel thumbnail" />` : ""}<div><p class="decision">${escapeHtml(item.recommendation)}${item.rank ? ` · #${item.rank}` : ""}</p><a href="${escapeHtml(item.url)}">${escapeHtml(item.caption)}</a><p>${escapeHtml(item.evidence)}</p><p class="meta">${escapeHtml(item.nextTest)}</p></div></li>`).join("")}</ol>`
    : "<p class=\"meta\">No public reels were saved with this audit.</p>";
  const enrichmentNote = transcriptEnrichmentStatus === "SUBMITTED"
    ? "<p class=\"callout\">Transcripts are being collected in the background. Reopen this export in a few minutes to see any completed spoken-hook analysis.</p>"
    : transcriptEnrichmentStatus === "FAILED"
      ? "<p class=\"meta\">Transcript collection was unavailable for this audit. The public metadata report is still complete.</p>"
      : "";
  const intelligence = metrics.contentIntelligence
    ? `<h3>Spoken-hook evidence</h3><p class="meta">${metrics.contentIntelligence.transcriptCount}/${metrics.contentIntelligence.totalReels} reels include a public transcript. ${metrics.contentIntelligence.audioCount}/${metrics.contentIntelligence.totalReels} include an exposed audio label. Missing data stays unavailable.</p>${enrichmentNote}${metrics.contentIntelligence.transcriptOpenings.length ? `<h4>Spoken openings</h4><ul>${metrics.contentIntelligence.transcriptOpenings.map((item) => `<li><a href="${escapeHtml(item.url)}">“${escapeHtml(item.opening)}”</a><br /><span class="meta">${escapeHtml(item.caption)}${item.views === undefined ? "" : ` — ${formatMetric(item.views)} public views`}</span></li>`).join("")}</ul>` : "<p class=\"meta\">No transcript was returned for these public reels.</p>"}${metrics.contentIntelligence.audioPatterns.length ? `<h4>Audio patterns</h4><ul>${metrics.contentIntelligence.audioPatterns.map((item) => `<li>${escapeHtml(item.label)} — ${formatMetric(item.averageViews)} average public views (${item.sampleSize} reels)</li>`).join("")}</ul>` : "<p class=\"meta\">No public audio label was returned for these reels.</p>"}`
    : "";
  const patterns = (title: string, items: PublicMetrics["postingWindows"]) => `<h3>${title}</h3>${items.length ? `<ul>${items.slice(0, 4).map((item) => `<li>${escapeHtml(item.label)} — ${formatMetric(item.averageViews)} average views (${item.sampleSize} reels)</li>`).join("")}</ul>` : "<p class=\"meta\">No public view data available.</p>"}`;

  return `<section>
        <h2>What the public sample shows</h2>
        <p class="callout">Public views and engagement only. Private platform analytics are not included.</p>
        <table>
          <tr><td>Total public views</td><td><strong>${formatMetric(metrics.summary.totalViews)}</strong></td></tr>
          <tr><td>Median public views</td><td><strong>${formatMetric(metrics.summary.medianViews)}</strong></td></tr>
          <tr><td>Public likes</td><td><strong>${formatMetric(metrics.summary.totalLikes)}</strong></td></tr>
          <tr><td>Public comments</td><td><strong>${formatMetric(metrics.summary.totalComments)}</strong></td></tr>
          <tr><td>Engagement per view</td><td><strong>${formatPercent(metrics.summary.engagementPerView)}</strong></td></tr>
        </table>
        ${reelEvidence}
        ${intelligence}
        ${patterns("Best public posting windows (UTC)", metrics.postingWindows)}
        ${patterns("Duration patterns", metrics.durationPatterns)}
        ${patterns("Caption-length patterns", metrics.captionPatterns)}
        ${patterns("Hashtag-count patterns", metrics.hashtagPatterns)}
        ${patterns("Hook-type patterns", metrics.hookPatterns)}
        <p class="meta">Private reach, watch-time, retention, audience demographics, and follower growth are not included in public-data audits.</p>
      </section>`;
}

function renderContentPrescription(input: AuditReportHtmlInput["contentPack"]): string {
  if (!input.contentPrescription?.length) return "";

  return `<section>
        <h2>Three posts to make next</h2>
        <p class="callout">Built from the public sample. Test these ideas; they are not private-reach promises.</p>
        ${input.contentPrescription.map((post, index) => `<article class="prescription"><p class="decision">POST ${String(index + 1).padStart(2, "0")}</p><h3>${escapeHtml(post.title)}</h3><p><strong>Observed evidence:</strong> ${escapeHtml(post.evidence)}</p><p><strong>Topic:</strong> ${escapeHtml(post.topic)}</p><p><strong>Hook:</strong> ${escapeHtml(post.hook)}</p><p><strong>First 3 seconds:</strong> ${escapeHtml(post.first3Seconds)}</p><p><strong>Shots or beats:</strong></p><ol>${post.shotsOrBeats.map((beat) => `<li>${escapeHtml(beat)}</li>`).join("")}</ol><p><strong>Caption direction:</strong> ${escapeHtml(post.captionDirection)}</p><p><strong>CTA:</strong> ${escapeHtml(post.cta)}</p><p><strong>Public test signal:</strong> ${escapeHtml(post.testSignal)}</p></article>`).join("")}
      </section>`;
}

export function renderAuditReportHtml(input: AuditReportHtmlInput): string {
  const subScoreRows = Object.entries(input.subScores)
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td><strong>${value}</strong></td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet" />
  <title>SocialOreo Audit Report</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: "Source Sans 3", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.6; margin: 0; background: #080a0d; color: #f8fafc; }
    main { max-width: 960px; margin: 0 auto; padding: 40px 20px 72px; }
    .hero { background: #101318; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 32px; }
    .score { color: #fb923c; font-size: 64px; font-weight: 900; line-height: 1; margin: 16px 0 0; }
    section { background: #101318; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 26px; margin-top: 18px; }
    h1, h2 { font-family: "Source Serif 4", Georgia, "Times New Roman", serif; font-weight: 600; letter-spacing: -.02em; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); line-height: 1.1; margin: 12px 0 0; max-width: 20ch; }
    h2 { font-size: 1.75rem; line-height: 1.2; margin-top: 0; }
    h3 { font-size: 1.125rem; line-height: 1.3; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.10); }
    .callout { background: rgba(251,146,60,.10); border: 1px solid rgba(251,146,60,.28); border-radius: 8px; color: rgba(255,255,255,.86); line-height: 1.65; max-width: 65ch; padding: 14px 16px; }
    .meta { font-size: 14px; color: rgba(255,255,255,.72); }
    ol { padding-left: 24px; }
    li { color: rgba(255,255,255,.80); line-height: 1.55; margin-bottom: 8px; }
    .reel { display: grid; grid-template-columns: 56px 1fr; gap: 12px; align-items: start; }
    .reel img { aspect-ratio: 3 / 4; width: 56px; border-radius: 6px; object-fit: cover; }
    .decision { color: #fb923c; font-size: 13px; font-weight: 700; letter-spacing: .08em; margin: 0 0 6px; }
    .prescription { border: 1px solid rgba(251, 146, 60, .25); border-radius: 8px; margin-top: 12px; padding: 16px; }
    @media (max-width: 640px) { main { padding: 24px 16px 48px; } .hero, section { padding: 20px; } h2 { font-size: 1.5rem; } }
  </style>
</head>
<body>
  <main>
    <article>
      <header class="hero">
        <p class="meta">SocialOreo expert campaign brief</p>
        <h1>${escapeHtml(input.summary.headline ?? "Campaign diagnosis")}</h1>
        <p class="score">${input.overallScore}/100</p>
        <p class="meta">${escapeHtml(input.profileUrl)} · ${input.videoCount} reels analyzed</p>
      </header>

      <section>
        <h2>Expert diagnosis</h2>
        <p class="callout">${escapeHtml(input.summary.diagnosis ?? "")}</p>
      </section>

      <section>
        <h2>Expert priorities</h2>
        <table>${subScoreRows}</table>
      </section>

        ${renderPublicMetrics(input.publicMetrics, input.transcriptEnrichmentStatus)}

      <section>
        <h2>Keep</h2>
        ${renderList(input.contentPack.strengths)}
      </section>

      <section>
        <h2>Change</h2>
        ${renderList(input.contentPack.weaknesses)}
      </section>

      ${renderReelStructures(input.contentPack)}

      ${renderContentPrescription(input.contentPack)}

      <section>
        <h2>Next moves</h2>
        <ol>${input.actionPlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </section>

      <section>
        <h2>Hooks</h2>
        ${renderList(input.contentPack.readyToPostHooks)}
      </section>

      <section>
        <h2>Scripts</h2>
        ${renderList(input.contentPack.readyToPostScripts)}
      </section>

      <section>
        <h2>Calls to action</h2>
        ${renderList(input.contentPack.ctaOptions)}
      </section>

      <section>
        <h2>Captions</h2>
        ${renderList(input.contentPack.captionPack)}
      </section>

      <section>
        <h2>Hashtag pack</h2>
        <p>${escapeHtml((input.contentPack.hashtagPack ?? []).join(" "))}</p>
      </section>
    </article>
  </main>
</body>
</html>`;
}
