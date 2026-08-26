import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const mutations = [
  {
    name: "remove DB Post write",
    file: "src/lib/socialolla/post/post-actions.ts",
    mutate: (text) => text.replace("tx.postRequest.create({", "tx.postRequest.create_REMOVED({"),
    control: (text) => text.includes("tx.postRequest.create({") && text.includes("tx.postDestination.create({"),
  },
  {
    name: "disable provider call",
    file: "src/lib/socialolla/publishing/publish-worker.ts",
    mutate: (text) => text.replace("provider.publish({", "provider.publish_DISABLED({"),
    control: (text) => text.includes("provider.publish({") && text.includes("markPublishProviderStarted"),
  },
  {
    name: "fake successful status",
    file: "src/lib/socialolla/publishing/publish-worker.ts",
    mutate: (text) => text.replace("markPublishSuccess({", "markPublishSuccess_REMOVED({"),
    control: (text) => text.includes("markPublishSuccess({") && text.includes("status: \"PUBLISHED\""),
  },
  {
    name: "remove ownership check",
    file: "src/lib/socialolla/publishing/job-service.ts",
    mutate: (text) => text.replace("postRequest: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId }, destination: { workspaceId: workspace.dbId }", "postRequest: { externalId: input.postRequestExternalId }, destination: {}"),
    control: (text) => text.includes("postRequest: { externalId: input.postRequestExternalId, workspaceId: workspace.dbId }") && text.includes("destination: { workspaceId: workspace.dbId }"),
  },
  {
    name: "drop ambiguous publish reconciliation",
    file: "src/lib/socialolla/publishing/publish-worker.ts",
    mutate: (text) => text.replace("markPublishReconciliationRequired({", "markPublishReconciliationRequired_REMOVED({"),
    control: (text) => text.includes("markPublishReconciliationRequired({") && text.includes('status: "RECONCILIATION_REQUIRED"'),
  },
];

const failures = [];
for (const mutation of mutations) {
  const original = source(mutation.file);
  if (!mutation.control(original)) failures.push(`${mutation.name}: baseline control missing`);
  if (mutation.control(mutation.mutate(original))) failures.push(`${mutation.name}: mutation was not detected`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", mutations: mutations.map((mutation) => mutation.name), mode: "source-contract" }));
