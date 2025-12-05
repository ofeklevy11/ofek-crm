"use client";

interface ViewTextModalProps {
  title: string;
  text: string;
  onClose: () => void;
  onEdit?: () => void;
}

export default function ViewTextModal({
  title,
  text,
  onClose,
  onEdit,
}: ViewTextModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-black">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-6 overflow-y-auto whitespace-pre-wrap wrap-break-word text-black">
          {text}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
          {onEdit && (
            <button
              onClick={onEdit}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <span>✏️</span> Edit Record
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-gray-100 text-black px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
