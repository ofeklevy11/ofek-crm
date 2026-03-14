import type { Metadata } from "next";
import CreateTableForm from "@/components/CreateTableForm";
import Link from "next/link";

export const metadata: Metadata = { title: "טבלה חדשה" };

export default function NewTablePage() {
  return (
    <div className="min-h-screen bg-muted/40" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/tables"
            prefetch={false}
            className="inline-flex items-center text-primary hover:text-primary/80 font-medium mb-4 transition text-sm"
          >
            <span className="ml-2">→</span> חזרה לטבלאות
          </Link>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            צור טבלה חדשה
          </h1>
          <p className="text-muted-foreground">
            עצב את הטבלה המותאמת אישית שלך עם שדות ואפשרויות
          </p>
        </div>
        <CreateTableForm />
      </div>
    </div>
  );
}
