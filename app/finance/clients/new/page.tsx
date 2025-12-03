import CreateClientForm from "@/components/finance/CreateClientForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewClientPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <Link
          href="/finance/clients"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clients
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create New Client</h1>
        <p className="text-gray-500 mt-1">
          Add a new client to the financial system.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <CreateClientForm />
      </div>
    </div>
  );
}
