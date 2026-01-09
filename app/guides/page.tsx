import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Workflow } from "lucide-react";
import Link from "next/link";

export default function GuidesPage() {
  const guides = [
    {
      title: "חיבור Make לטבלאות",
      description:
        "למד כיצד לחבר אוטומציות מ-Make (כמו פייסבוק לידים) ישירות לטבלאות ה-CRM שלך.",
      icon: Workflow,
      href: "/guides/make-integration",
      color: "text-purple-500",
      bgColor: "bg-purple-100",
    },
    // Future guides can be added here
  ];

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">מדריכים ותיעוד</h1>
          <p className="text-slate-600 mt-2">
            למד כיצד להפיק את המרב ממערכת ה-CRM שלך.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {guides.map((guide, index) => (
            <Link key={index} href={guide.href} className="block group">
              <Card className="h-full transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-slate-200">
                <CardHeader>
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${guide.bgColor}`}
                  >
                    <guide.icon className={`w-6 h-6 ${guide.color}`} />
                  </div>
                  <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">
                    {guide.title}
                  </CardTitle>
                  <CardDescription>{guide.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-sm font-medium text-blue-600">
                    קרא את המדריך
                    <ArrowRight className="w-4 h-4 mr-1 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
