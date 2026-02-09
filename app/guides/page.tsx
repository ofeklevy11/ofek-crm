import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Workflow, CheckSquare, Calendar, Info } from "lucide-react";
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
    {
      title: "יצירת משימות אוטומטית",
      description:
        "למד כיצד לפתוח משימות בלוח המשימות ישירות מאוטומציות חיצוניות.",
      icon: CheckSquare,
      href: "/guides/make-tasks",
      color: "text-blue-500",
      bgColor: "bg-blue-100",
    },
    {
      title: "יצירת אירועים ביומן",
      description:
        "למד כיצד ליצור פגישות ואירועים בלוח השנה באופן אוטומטי מכל מקור חיצוני.",
      icon: Calendar,
      href: "/guides/make-calendar",
      color: "text-orange-500",
      bgColor: "bg-orange-100",
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

        <Card className="mb-8 border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-amber-900 font-medium">
                  על מנת לעבוד מול Make או לבצע קריאות אחרות למערכת יש לדבר עם אופק מנהל המערכת{" "}
                  <a
                    href="mailto:ofekconnect4@gmail.com"
                    className="text-amber-700 hover:text-amber-800 underline"
                  >
                    ofekconnect4@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
