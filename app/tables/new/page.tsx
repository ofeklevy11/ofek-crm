import CreateTableForm from "@/components/CreateTableForm";
import Link from "next/link";

export default function NewTablePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/tables"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition"
          >
            <span className="mr-2">←</span> Back to Tables
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Create New Table
          </h1>
          <p className="text-gray-600">
            Design your custom table with fields and options
          </p>
        </div>
        <CreateTableForm />
      </div>
    </div>
  );
}
