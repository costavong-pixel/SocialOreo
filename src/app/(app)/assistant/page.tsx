import { AssistantPanel } from "@/components/assistant/assistant-panel";

export const metadata = { title: "Assistant — SocialOlla" };

export default async function AssistantPage() {
  return (
    <section>
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.04em]">Assistant</h1>
      <p className="mt-2 text-white/70">Unified assistant for your workspace. Actions: Explain · Draft · Propose action · Execute.</p>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <AssistantPanel authenticated />
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <p className="text-sm text-white/80">Protected actions (Execute) show an exact preview (account, destination, content, schedule, cost, consequences) and require explicit confirmation with the issued token.</p>
        <p className="mt-3 text-xs text-white/50">No chain-of-thought, secrets, raw provider payloads or cross-user data are included in transcripts.</p>
      </div>
    </section>
  );
}
