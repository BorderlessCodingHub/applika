import { InputHTMLAttributes } from 'react';

export default function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full h-11 px-4 rounded-lg bg-transparent border border-white/30 text-white placeholder-white/50
                 focus:outline-none focus:border-white/50 focus:bg-white/10 transition"
    />
  );
}
