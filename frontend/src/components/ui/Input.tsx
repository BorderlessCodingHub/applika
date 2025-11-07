interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <input
        {...props}
        className="px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
