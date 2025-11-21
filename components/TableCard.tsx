"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditTableModal from "./EditTableModal";
import AlertDialog from "./AlertDialog";

interface TableCardProps {
  table: {
    id: number;
    name: string;
    slug: string;
    createdAt: Date;
    _count: { records: number };
  };
}

export default function TableCard({ table }: TableCardProps) {
  const router = useRouter();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------
  // Handlers
  // ---------------------------

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/tables/${table.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed");

      router.push("/tables"); // ← מונע רינדורים כפולים
    } catch (error) {
      console.error(error);
      alert("Error deleting table");
    } finally {
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // בלוק כשמקליקים על כפתור
    if (target.tagName === "BUTTON" || target.closest("button")) return;

    router.push(`/tables/${table.id}`);
  };

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <>
      <div
        className="relative group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-gray-100 cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Title + Slug */}
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-black">{table.name}</h2>

          <span className="text-xs font-mono bg-gray-100 text-black py-1 px-2 rounded">
            {table.slug}
          </span>
        </div>

        {/* Records */}
        <p className="text-black text-sm mb-4">
          {table._count.records}{" "}
          {table._count.records === 1 ? "record" : "records"}
        </p>

        {/* Created date */}
        <div className="text-xs text-black">
          Created {new Date(table.createdAt).toLocaleDateString()}
        </div>

        {/* Buttons (appear on hover) */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
          <button
            onClick={handleEditClick}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 shadow-md transition"
            disabled={isDeleting}
          >
            Edit
          </button>

          <button
            onClick={handleDeleteClick}
            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700 shadow-md transition disabled:opacity-50"
            disabled={isDeleting}
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      <EditTableModal
        tableId={table.id}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      />

      {/* Delete Dialog */}
      <AlertDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Table"
        description={`Are you sure you want to delete "${table.name}"? This will permanently delete all ${
          table._count.records
        } ${table._count.records === 1 ? "record" : "records"}, and this action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
      />
    </>
  );
}
