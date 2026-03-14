import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { redirect } from "next/navigation";
import DataCollectionWizard from "@/components/finance/DataCollectionWizard";
import ActiveSyncRules from "@/components/finance/ActiveSyncRules";
import { getSyncRules } from "@/app/actions/finance-sync";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "גביית חובות" };

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
    <div className="min-h-screen bg-[#f4f8f8] p-6 md:p-12 space-y-8" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              <span className="bg-clip-text text-transparent bg-gradient-to-l from-[#4f95ff] to-[#a24ec1]">
                איסוף נתונים חכם
              </span>
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl font-light">
              הגדר חוקים אוטומטיים לייבוא הכנסות והוצאות מכל מקור נתונים בארגון
            </p>
          </div>
          <Link
            href="/finance/income-expenses"
            className="hidden md:flex items-center px-5 py-2.5 rounded-full bg-white text-gray-600 hover:text-[#4f95ff] shadow-sm hover:shadow-md transition-all text-sm font-medium border border-gray-100"
          >
            <ArrowRight className="w-4 h-4 ml-2" /> חזרה לדוח הפיננסי
          </Link>
        </div>

        {/* Mobile Back Link */}
        <div className="md:hidden">
          <Link
            href="/finance/income-expenses"
            className="flex items-center text-sm text-gray-500 hover:text-[#4f95ff] transition-colors"
          >
            <ArrowRight className="w-4 h-4 ml-1" /> חזרה לדוח הפיננסי
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 items-start">
          <div className="lg:col-span-8 space-y-8">
            <DataCollectionWizard tables={parsedTables} />
          </div>

          <div className="lg:col-span-4 space-y-6">
            {/* Sidebar / Active Rules / Tips could go here */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-full min-h-[400px]">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#a24ec1]" aria-hidden="true" />
                חוקים פעילים
              </h2>

              {existingRules.length > 0 ? (
                <ActiveSyncRules rules={existingRules} />
              ) : (
                <div className="text-center text-gray-400 py-10 flex flex-col items-center justify-center h-full">
                  <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                    <Sparkles className="w-6 h-6 text-gray-300" aria-hidden="true" />
                  </div>
                  <p className="font-medium">אין חוקים פעילים כרגע</p>
                  <p className="text-sm mt-2 max-w-xs">
                    צור חוק חדש בצד ימין כדי להתחיל בסנכרון אוטומטי של נתונים
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
