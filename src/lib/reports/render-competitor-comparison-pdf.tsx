import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { CompetitorComparison } from "./competitor-comparison";

export type CompetitorComparisonPdfInput = {
  yourLabel: string;
  competitorLabel: string;
  yourGoal: string;
  competitorGoal: string;
  comparison: CompetitorComparison;
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: "#18181b", fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.55, padding: 42 },
  eyebrow: { color: "#c2410c", fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 24, lineHeight: 1.15, marginTop: 8 },
  subtitle: { color: "#52525b", fontSize: 11, marginTop: 9 },
  section: { marginTop: 20 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, marginBottom: 8 },
  note: { backgroundColor: "#f4f4f5", color: "#52525b", fontSize: 10, marginTop: 12, padding: 10 },
  metric: { borderBottomColor: "#e4e4e7", borderBottomWidth: 1, flexDirection: "row", gap: 10, paddingVertical: 7 },
  metricLabel: { color: "#52525b", flex: 1 },
  metricValue: { flex: 1, fontFamily: "Helvetica-Bold" },
  card: { borderColor: "#ddd6fe", borderWidth: 1, marginBottom: 10, padding: 11 },
  cardTitle: { color: "#6d28d9", fontFamily: "Helvetica-Bold", fontSize: 11 },
  body: { color: "#3f3f46", marginTop: 6 },
  test: { color: "#18181b", fontFamily: "Helvetica-Bold", marginTop: 8 },
  item: { flexDirection: "row", gap: 7, marginBottom: 6 },
  bullet: { color: "#c2410c", fontFamily: "Helvetica-Bold" },
  itemText: { color: "#3f3f46", flex: 1 },
  footer: { bottom: 24, color: "#71717a", fontSize: 9, left: 42, position: "absolute", right: 42, textAlign: "center" },
});

function NumberedList({ items }: { items: string[] }) {
  return <View>{items.map((item, index) => <View key={`${index}-${item.slice(0, 24)}`} style={styles.item} wrap={false}><Text style={styles.bullet}>{index + 1}.</Text><Text style={styles.itemText}>{item}</Text></View>)}</View>;
}

function CompetitorComparisonPdf({ input }: { input: CompetitorComparisonPdfInput }) {
  const { comparison } = input;

  return (
    <Document author="SocialOlla" title="SocialOlla competitor comparison">
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>SocialOlla client comparison</Text>
        <Text style={styles.title}>{input.yourLabel} vs {input.competitorLabel}</Text>
        <Text style={styles.subtitle}>Campaign goals: {input.yourGoal} / {input.competitorGoal}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Public performance snapshot</Text>
          {comparison.metrics.map((metric) => <View key={metric.label} style={styles.metric}><Text style={styles.metricLabel}>{metric.label}</Text><Text style={styles.metricValue}>{input.yourLabel}: {metric.yours}</Text><Text style={styles.metricValue}>{input.competitorLabel}: {metric.competitor}</Text></View>)}
          <Text style={styles.note}>{comparison.scoreIsComparable ? "Campaign scores use the same goal. Public performance is still an estimate from available public data, not private Instagram Insights." : "The campaign goals differ, so scores are not a ranking. Use the public reel patterns below as test ideas, not as private-performance claims."}</Text>
        </View>

        {comparison.contentGaps.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Patterns to test next</Text>{comparison.contentGaps.map((gap) => <View key={gap.category} style={styles.card} wrap={false}><Text style={styles.cardTitle}>{gap.category}: {gap.title}</Text><Text style={styles.body}>{gap.evidence}</Text><Text style={styles.test}>Test: {gap.test}</Text></View>)}</View> : null}

        {comparison.hookExtractions.length ? <View style={styles.section} break><Text style={styles.sectionTitle}>Competitor hook ideas</Text><Text style={styles.note}>Observed public opening lines are included to identify a structure. Use the live comparison page to generate two original examples for the campaign; do not copy the competitor&apos;s wording.</Text>{comparison.hookExtractions.map((hook, index) => <View key={`${hook.sourceUrl}-${index}`} style={styles.card} wrap={false}><Text style={styles.cardTitle}>What they are doing: {hook.pattern}</Text><Text style={styles.body}>Their opening: “{hook.sourceHook}”</Text><Text style={styles.body}>{hook.evidence}</Text><Text style={styles.test}>Simple use: {hook.testHook}</Text></View>)}</View> : null}

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>Recommended next tests</Text>
          <NumberedList items={comparison.studyIdeas} />
        </View>

        <Text fixed render={({ pageNumber, totalPages }) => `SocialOlla client comparison · ${pageNumber} / ${totalPages}`} style={styles.footer} />
      </Page>
    </Document>
  );
}

export async function renderCompetitorComparisonPdf(input: CompetitorComparisonPdfInput): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<CompetitorComparisonPdf input={input} />));
}
