import { ReactNode } from "react";

export default function ProfileCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <div className="backdrop-blur-xl bg-white/5 border border-white/20 rounded-2xl shadow-lg p-6 mb-6">
      <h4 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <i className={`fa-solid ${icon}`}></i> {title}
      </h4>
      {children}
    </div>
  );
}
