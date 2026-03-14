"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AnalyticsDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tableName: string;
  data: {
    id: string;
    title: string;
    status: string;
    duration: string;
    updatedAt: string;
    type: string;
    recordId: string | number;
  }[];
}

export default function AnalyticsDetailsModal({
  isOpen,
  onClose,
  title,
  tableName,
  data,
}: AnalyticsDetailsModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="border-b border-gray-200 pb-4">
          <DialogTitle className="text-xl line-clamp-1">{title}</DialogTitle>
          <DialogDescription>
            מקור:{" "}
            <span className="font-medium text-gray-700">{tableName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {data.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              אין נתונים להצגה
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <caption className="sr-only">{title}</caption>
                <thead className="bg-gray-50 text-gray-700 text-sm">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium text-right rounded-tr-lg"
                    >
                      {(data[0] as any).type?.includes("group")
                        ? "קבוצה"
                        : "שם / מזהה"}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium text-right"
                    >
                      {(data[0] as any).type === "conversion-group"
                        ? "המרות / סה״כ"
                        : "סטטוס / פרטים"}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium text-right rounded-tl-lg"
                    >
                      {(data[0] as any).type === "conversion-group"
                        ? "אחוז המרה"
                        : "ערך / זמן"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {item.title || item.id}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {item.status && item.status.includes(" → ") ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {item.status
                              .split(" → ")
                              .map((part, index, arr) => {
                                const match = part.match(/^(.*)\s\((.*)\)$/);
                                const eventName = match ? match[1] : part;
                                const partTableName = match ? match[2] : "";
                                return (
                                  <div
                                    key={index}
                                    className="flex items-center"
                                  >
                                    <div className="flex flex-col items-start bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                      <span className="font-medium text-sm text-gray-800">
                                        {eventName}
                                      </span>
                                      {partTableName && (
                                        <span className="text-xs text-gray-500 mt-0.5 opacity-80 flex items-center gap-1">
                                          <span
                                            className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                            aria-hidden="true"
                                          ></span>
                                          {partTableName}
                                        </span>
                                      )}
                                    </div>
                                    {index < arr.length - 1 && (
                                      <span className="text-gray-400 mx-2 text-lg">
                                        →
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 rounded-md text-sm">
                            {item.status || "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-blue-600 font-medium ltr text-right">
                        <span dir="ltr">
                          {item.duration || (item as any).value || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-lg pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            סגור
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
