"use client";

export default function MeetingsBackgroundDecor() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(45,212,191,0.15) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-60 -left-60 w-[600px] h-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-1/3 -left-20 w-[350px] h-[350px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(45,212,191,0.08) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
