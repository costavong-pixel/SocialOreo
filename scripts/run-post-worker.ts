import { assertWorkerRuntimeReadiness } from "./worker-runtime-preflight";

async function main(): Promise<void> {
  const result = assertWorkerRuntimeReadiness({ worker: "post", env: process.env, argv: process.argv });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Post worker failed"}\n`);
  process.exitCode = 1;
});
