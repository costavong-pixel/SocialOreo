import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { PublicMetrics } from "./public-metrics";

type ContentPack = {
  strengths?: string[];
  weaknesses?: string[];
  readyToPostHooks?: string[];
  readyToPostScripts?: string[];
  ctaOptions?: string[];
  captionPack?: string[];
  hashtagPack?: string[];
  contentPrescription?: Array<{ title: string; evidence: string; topic: string; hook: string; first3Seconds: string; shotsOrBeats: string[]; captionDirection: string; cta: string; testSignal: string }>;
};

export type AuditReportPdfInput = {
  profileUrl: string;
  videoCount: number;
  transcriptEnrichmentStatus?: string;
  publicMetrics?: PublicMetrics;
  overallScore: number;
  summary: { headline?: string; diagnosis?: string };
  actionPlan: string[];
  contentPack: ContentPack;
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#18181b", fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.55, padding: 42 },
  eyebrow: { color: "#c2410c", fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 24, lineHeight: 1.15, marginTop: 8 },
  profile: { color: "#52525b", fontSize: 10, marginTop: 8 },
  scoreCard: { backgroundColor: "#fff7ed", borderColor: "#fdba74", borderWidth: 1, marginTop: 18, padding: 14 },
  score: { color: "#c2410c", fontFamily: "Helvetica-Bold", fontSize: 22 },
  scoreLabel: { color: "#7c2d12", fontSize: 10, marginTop: 2 },
  section: { marginTop: 20 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 8 },
  paragraph: { color: "#3f3f46" },
  note: { backgroundColor: "#f4f4f5", color: "#52525b", fontSize: 10, marginTop: 12, padding: 10 },
  item: { flexDirection: "row", gap: 7, marginBottom: 6 },
  bullet: { color: "#c2410c", fontFamily: "Helvetica-Bold" },
  itemText: { flex: 1, color: "#3f3f46" },
  reelCard: { borderColor: "#e4e4e7", borderWidth: 1, marginBottom: 8, padding: 9 },
  reelDecision: { color: "#c2410c", fontFamily: "Helvetica-Bold", fontSize: 9.5, letterSpacing: .8 },
  reelCaption: { color: "#18181b", fontFamily: "Helvetica-Bold", marginTop: 4 },
  reelMeta: { color: "#52525b", fontSize: 10, marginTop: 4 },
  footer: { bottom: 24, color: "#71717a", fontSize: 9, left: 42, position: "absolute", right: 42, textAlign: "center" },
});

function List({ items }: { items?: string[] }) {
  if (!items?.length) return <Text style={styles.paragraph}>No recommendations were generated for this section.</Text>;

  return (
    <View>
      {items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 24)}`} style={styles.item} wrap={false}>
          <Text style={styles.bullet}>{index + 1}.</Text>
          <Text style={styles.itemText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ReelEvidence({ metrics }: { metrics?: PublicMetrics }) {
  if (!metrics?.reelEvidence?.length) return <Text style={styles.paragraph}>No public reels were saved with this audit.</Text>;

  return (
    <View>
      <Text style={styles.note}>Ranked by public views. Every reel includes one practical next test.</Text>
      {metrics.reelEvidence.map((reel) => (
        <View key={reel.id} style={styles.reelCard} wrap={false}>
          <Text style={styles.reelDecision}>{reel.recommendation}{reel.rank ? ` · #${reel.rank}` : ""}</Text>
          <Text style={styles.reelCaption}>{reel.caption}</Text>
          <Text style={styles.reelMeta}>{reel.evidence}</Text>
          <Text style={styles.reelMeta}>Next test: {reel.nextTest}</Text>
        </View>
      ))}
    </View>
  );
}

function ContentIntelligenceSection({ metrics, transcriptEnrichmentStatus }: { metrics?: PublicMetrics; transcriptEnrichmentStatus?: string }) {
  const intelligence = metrics?.contentIntelligence;
  if (!intelligence) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Spoken-hook evidence</Text>
      <Text style={styles.note}>{intelligence.transcriptCount}/{intelligence.totalReels} reels include a public transcript. {intelligence.audioCount}/{intelligence.totalReels} include an exposed audio label. Missing data stays unavailable.</Text>
      {transcriptEnrichmentStatus === "SUBMITTED" ? <Text style={styles.note}>Transcripts are being collected in the background. Download a fresh report in a few minutes to see any completed spoken-hook analysis.</Text> : null}
      {transcriptEnrichmentStatus === "FAILED" ? <Text style={styles.note}>Transcript collection was unavailable for this audit. The public metadata report is still complete.</Text> : null}
      <Text style={[styles.reelCaption, { marginTop: 10 }]}>Spoken openings</Text>
      {intelligence.transcriptOpenings.length ? intelligence.transcriptOpenings.map((reel) => (
        <View key={reel.id} style={styles.reelCard} wrap={false}>
          <Text style={styles.itemText}>“{reel.opening}”</Text>
          <Text style={styles.reelMeta}>{reel.caption}</Text>
        </View>
      )) : <Text style={styles.paragraph}>No transcript was returned for these public reels.</Text>}
      <Text style={[styles.reelCaption, { marginTop: 10 }]}>Audio patterns</Text>
      {intelligence.audioPatterns.length ? intelligence.audioPatterns.map((pattern) => (
        <Text key={pattern.label} style={styles.reelMeta}>{pattern.label}: {pattern.averageViews.toLocaleString()} average public views across {pattern.sampleSize} reels.</Text>
      )) : <Text style={styles.paragraph}>No public audio label was returned for these reels.</Text>}
    </View>
  );
}

function ContentPrescriptionSection({ prescriptions }: { prescriptions?: ContentPack["contentPrescription"] }) {
  if (!prescriptions?.length) return null;

  return (
    <View style={styles.section} break>
      <Text style={styles.sectionTitle}>Three posts to make next</Text>
      <Text style={styles.note}>Built from the public sample. Test these ideas; they are not private-reach promises.</Text>
      {prescriptions.map((post, index) => (
        <View key={`${post.title}-${index}`} style={styles.reelCard} wrap={false}>
          <Text style={styles.reelDecision}>POST {String(index + 1).padStart(2, "0")}</Text>
          <Text style={styles.reelCaption}>{post.title}</Text>
          <Text style={styles.reelMeta}>Observed evidence: {post.evidence}</Text>
          <Text style={styles.reelMeta}>Topic: {post.topic}</Text>
          <Text style={styles.reelMeta}>Hook: {post.hook}</Text>
          <Text style={styles.reelMeta}>First 3 seconds: {post.first3Seconds}</Text>
          <Text style={styles.reelMeta}>Shots or beats: {post.shotsOrBeats.join(" · ")}</Text>
          <Text style={styles.reelMeta}>Caption direction: {post.captionDirection}</Text>
          <Text style={styles.reelMeta}>CTA: {post.cta}</Text>
          <Text style={styles.reelMeta}>Public test signal: {post.testSignal}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPdf({ input }: { input: AuditReportPdfInput }) {
  const content = input.contentPack;

  return (
    <Document title="SocialOreo campaign report" author="SocialOreo">
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>SocialOreo expert campaign brief</Text>
        <Text style={styles.title}>{input.summary.headline ?? "Campaign diagnosis"}</Text>
        <Text style={styles.profile}>{input.profileUrl}</Text>

        <View style={styles.scoreCard}>
          <Text style={styles.score}>{input.overallScore}/100</Text>
          <Text style={styles.scoreLabel}>Campaign readiness score · {input.videoCount} public reels analyzed</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expert diagnosis</Text>
          <Text style={styles.paragraph}>{input.summary.diagnosis ?? "Your content was analyzed against the campaign brief."}</Text>
          <Text style={styles.note}>Public views and engagement only. Private platform analytics are not included.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next moves</Text>
          <List items={input.actionPlan} />
        </View>

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>Keep, change, or stop</Text>
          <ReelEvidence metrics={input.publicMetrics} />
        </View>

        <ContentIntelligenceSection metrics={input.publicMetrics} transcriptEnrichmentStatus={input.transcriptEnrichmentStatus} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Keep</Text>
          <List items={content.strengths} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change</Text>
          <List items={content.weaknesses} />
        </View>

        <ContentPrescriptionSection prescriptions={content.contentPrescription} />

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>Hooks</Text>
          <List items={content.readyToPostHooks} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scripts</Text>
          <List items={content.readyToPostScripts} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calls to action</Text>
          <List items={content.ctaOptions} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Captions</Text>
          <List items={content.captionPack} />
        </View>

        {content.hashtagPack?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hashtag pack</Text>
            <Text style={styles.paragraph}>{content.hashtagPack.join(" ")}</Text>
          </View>
        ) : null}

        <Text fixed render={({ pageNumber, totalPages }) => `SocialOreo · ${pageNumber} / ${totalPages}`} style={styles.footer} />
      </Page>
    </Document>
  );
}

export async function renderAuditReportPdf(input: AuditReportPdfInput): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<ReportPdf input={input} />));
}
