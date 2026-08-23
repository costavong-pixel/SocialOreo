import { CompetitorComparisonPage } from "@/app/audits/[id]/compare/page";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ competitor?: string | string[]; competitors?: string | string[] }>;
};

export default async function AnalysisComparisonRoute({ params, searchParams }: PageProps) {
  return <CompetitorComparisonPage params={params} searchParams={searchParams} />;
}
