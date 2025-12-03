import CreateRetainerForm from "@/components/finance/CreateRetainerForm";

export default function NewRetainerPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Create New Retainer
        </h1>
        <p className="text-gray-500 mt-1">
          Set up a recurring billing agreement.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <CreateRetainerForm />
      </div>
    </div>
  );
}
