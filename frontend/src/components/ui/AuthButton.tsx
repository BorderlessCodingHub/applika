import { ButtonHTMLAttributes } from 'react';

export default function AuthButton({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="w-full py-3 rounded-lg bg-emerald-400/90 hover:bg-emerald-400/70
                 text-black font-semibold transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
