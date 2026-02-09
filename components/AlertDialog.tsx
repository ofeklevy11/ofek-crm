"use client";

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode | string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function AlertDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "המשך",
  cancelText = "ביטול",
  isDestructive = false,
}: AlertDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <div className="text-sm text-gray-600">{description}</div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition ${
              isDestructive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
