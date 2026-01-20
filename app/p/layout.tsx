export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-rubik" dir="rtl">
      <main className="flex-1">{children}</main>
    </div>
  );
}
