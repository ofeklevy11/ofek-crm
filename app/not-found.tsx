import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h2 className="text-2xl font-bold mb-4">404 - דף לא נמצא</h2>
      <p className="mb-4">מצטערים, הדף שחיפשת אינו קיים.</p>
      <Link href="/" className="text-blue-500 hover:underline">
        חזרה לדף הבית
      </Link>
    </div>
  );
}
