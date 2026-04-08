import { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white/10 border border-white/20 rounded-2xl shadow-lg p-6">
      {children}
    </div>
  );
}
