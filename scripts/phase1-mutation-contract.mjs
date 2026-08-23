import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const read = (files, relativePath) => files.get(relativePath) ?? fs.readFileSync(path.join(root, relativePath), "utf8");

function assertContract(files) {
  const shell = read(files, "src/lib/socialolla/shell/shell.ts");
  const publicPage = read(files, "src/app/page.tsx");
  const pricing = read(files, "src/app/pricing/page.tsx");
  const dashboard = read(files, "src/app/dashboard/page.tsx");
  const post = read(files, "src/app/post/page.tsx");
  const brand = read(files, "src/components/brand/brand-mark.tsx");
  const nav = read(files, "src/components/nav/app-shell-nav.tsx");
  const analysisPage = read(files, "src/app/audits/[id]/page.tsx");
  const analysisApi = read(files, "src/app/api/audits/[id]/route.ts");
  const feedbackApi = read(files, "src/app/api/audits/[id]/feedback/route.ts");

  for (const href of ["/home", "/posts", "/watch", "/calendar", "/connections", "/credits", "/analysis", "/assistant", "/settings"]) {
    if (!shell.includes(`href: "${href}"`)) throw new Error(`missing shell route ${href}`);
  }
  if (publicPage.includes('href="/dashboard"') || pricing.includes('href="/dashboard"')) throw new Error("public dashboard link is legacy");
  if (!dashboard.includes('permanentRedirect("/home")')) throw new Error("dashboard is not a compatibility redirect");
  if (!post.includes('permanentRedirect("/posts")')) throw new Error("post is not a compatibility redirect");
  if (!brand.includes("SocialOlla") || brand.includes("SocialOreo")) throw new Error("legacy brand is customer-visible");
  if (!nav.includes("{isAdmin ? (") || !nav.includes('href="/admin/plans"')) throw new Error("admin link is not role-gated");
  if (!analysisPage.includes("where: { id, userId: resolution.dbId }")) throw new Error("analysis page ownership bypass");
  if (!analysisApi.includes("where: { id, userId: resolution.dbId }")) throw new Error("analysis API ownership bypass");
  if (!feedbackApi.includes("userId: dbUserId")) throw new Error("feedback ownership bypass");
}

const mutations = [
  {
    id: "dashboard-link-to-legacy",
    file: "src/app/page.tsx",
    mutate: (value) => value.replace('href="/home">Dashboard', 'href="/dashboard">Dashboard'),
  },
  {
    id: "socialolla-brand-to-legacy",
    file: "src/components/brand/brand-mark.tsx",
    mutate: (value) => value.replace("SocialOlla", "SocialOreo"),
  },
  {
    id: "remove-post-nav",
    file: "src/lib/socialolla/shell/shell.ts",
    mutate: (value) => value.replace(/\s*\{ href: "\/posts", labelKey: "nav\.posts" \},/, ""),
  },
  {
    id: "remove-watch-nav",
    file: "src/lib/socialolla/shell/shell.ts",
    mutate: (value) => value.replace(/\s*\{ href: "\/watch", labelKey: "nav\.watch" \},/, ""),
  },
  {
    id: "remove-analysis-nav",
    file: "src/lib/socialolla/shell/shell.ts",
    mutate: (value) => value.replace(/\s*\{ href: "\/analysis", labelKey: "nav\.analysis" \},/, ""),
  },
  {
    id: "expose-admin-feedback-to-user",
    file: "src/components/nav/app-shell-nav.tsx",
    mutate: (value) => value.replace("{isAdmin ? (", "{true ? ("),
  },
  {
    id: "analysis-ownership-bypass",
    file: "src/app/audits/[id]/page.tsx",
    mutate: (value) => value.replace("userId: resolution.dbId", "user: { authUserId: \"legacy\" }"),
  },
  {
    id: "dashboard-renders-legacy-ui",
    file: "src/app/dashboard/page.tsx",
    mutate: (value) => value.replace('permanentRedirect("/home");', 'return <div>SocialOreo advantage</div>;'),
  },
];

const results = [];
for (const mutation of mutations) {
  const files = new Map([[mutation.file, mutation.mutate(fs.readFileSync(path.join(root, mutation.file), "utf8"))]]);
  try {
    assertContract(files);
    results.push({ id: mutation.id, result: "SURVIVED" });
  } catch {
    results.push({ id: mutation.id, result: "KILLED" });
  }
}

const killed = results.filter((result) => result.result === "KILLED").length;
const survived = results.filter((result) => result.result === "SURVIVED").length;
console.log(JSON.stringify({ attempted: results.length, killed, survived, results }, null, 2));
if (survived > 0) process.exitCode = 1;
