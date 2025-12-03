import CreatePaymentForm from "@/components/finance/CreatePaymentForm";

export default function NewPaymentPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Create One-Time Payment
        </h1>
        <p className="text-gray-500 mt-1">
          Record a new one-time charge for a client.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <CreatePaymentForm />
      </div>
    </div>
  );
}
