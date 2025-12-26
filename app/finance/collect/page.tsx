import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import DataCollectionWizard from "@/components/finance/DataCollectionWizard";
import ActiveSyncRules from "@/components/finance/ActiveSyncRules";
import { getSyncRules } from "@/app/actions/finance-sync";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default async function CollectDataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [tables, existingRules] = await Promise.all([
    prisma.tableMeta.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, schemaJson: true },
    }),
    getSyncRules(),
  ]);

  const parsedTables = tables.map((t) => {
    let columns: any[] = [];
    try {
      const schema = t.schemaJson as any;

      let rawColumns: any[] = [];
      if (Array.isArray(schema)) {
        rawColumns = schema;
      } else if (schema && Array.isArray(schema.columns)) {
        rawColumns = schema.columns;
      }

      columns = rawColumns.map((c: any) => ({
        id: c.id || c.name,
        key: c.name,
        name: c.label || c.name,
        type: c.type || "text",
      }));
    } catch (e) {
      console.error("Schema parsing error for table", t.id);
    }
    return { id: t.id, name: t.name, columns };
  });

  return (
    <div className="min-h-screen bg-[#f4f8f8] p-8 space-y-8" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/finance/income-expenses"
          className="inline-flex items-center text-sm text-gray-500 hover:text-[#4f95ff] mb-6 transition-colors"
        >
          <ArrowRight className="w-4 h-4 ml-1" /> חזרה לדוח הפיננסי
        </Link>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-gray-900">
            איסוף נתונים דינמי
          </h1>
          <p className="text-gray-500 mt-2 max-w-lg mx-auto">
            הגדר חוקים חכמים לייבוא אוטומטי של הכנסות והוצאות מכל טבלה או ממערכת
            התשלומים.
          </p>
        </div>

        <DataCollectionWizard tables={parsedTables} />

        {existingRules.length > 0 && (
          <>
            <Separator className="my-12" />
            <ActiveSyncRules rules={existingRules} />
          </>
        )}
      </div>
    </div>
  );
}
