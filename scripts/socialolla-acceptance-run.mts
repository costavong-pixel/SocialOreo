/**
 * External cross-repository acceptance runner (executed by tsx from
 * scripts/socialolla-cross-repo-acceptance.ts). Runs the REAL SocialOreo
 * HttpContentFactoryClient against a live Content Factory /internal/v1.
 */
import assert from "node:assert";
import { HttpContentFactoryClient } from "../src/lib/socialolla/content-factory/client";

const baseUrl = process.env.SOCIALOLLA_CF_BASE_URL;
const secret = process.env.SOCIALOLLA_CF_SECRET;
if (!baseUrl || !secret) {
  throw new Error("SOCIALOLLA_CF_BASE_URL and SOCIALOLLA_CF_SECRET are required");
}

const client = new HttpContentFactoryClient(baseUrl, secret, 5_000);

async function run(): Promise<void> {
  // Auth + HMAC + locale preservation
  const created = await client.createRequest({
    workspaceExternalId: "wsp_abcdefghijklmnop",
    destinationRef: "dst_abcdefghijklmnop",
    profileRef: "prf_abcdefghijklmnop",
    language: "ar",
    requestedCount: 10,
    idempotencyKey: "so:wsp_abcdefghijklmnop:external-1",
  });
  assert.strictEqual(created.status, "review");
  assert.strictEqual(created.language, "ar");
  assert.strictEqual(created.requestedCount, 10);

  // Duplicate idempotency -> same request
  const duplicate = await client.createRequest({
    workspaceExternalId: "wsp_abcdefghijklmnop",
    destinationRef: "dst_abcdefghijklmnop",
    profileRef: "prf_abcdefghijklmnop",
    language: "ar",
    requestedCount: 10,
    idempotencyKey: "so:wsp_abcdefghijklmnop:external-1",
  });
  assert.strictEqual(duplicate.id, created.id);

  // Workspace isolation
  const other = await client.getRequest(created.id, "wsp_999999999999");
  assert.strictEqual(other, null);

  // Invalid credential rejected
  const bad = await fetch(`${baseUrl}/internal/v1/requests?workspace_external_id=wsp_abcdefghijklmnop`, {
    headers: { "X-SocialOlla-Service": "socialoreo", Authorization: "Bearer wrong" },
  });
  assert.strictEqual(bad.status, 401);

  // Malformed destination rejected
  let malformedRejected = false;
  try {
    await client.createRequest({
      workspaceExternalId: "wsp_abcdefghijklmnop",
      destinationRef: "bad-ref",
      language: "en",
      requestedCount: 10,
      idempotencyKey: "so:wsp_abcdefghijklmnop:external-bad",
    });
  } catch {
    malformedRejected = true;
  }
  assert.strictEqual(malformedRejected, true);

  console.log("external acceptance assertions passed");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
