import { AuditReportPage } from "@/app/audits/[id]/page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnalysisReportRoute({ params }: PageProps) {
  return <AuditReportPage params={params} />;
}
