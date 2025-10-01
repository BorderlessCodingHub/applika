import Link from 'next/link';
import { FaGithub } from 'react-icons/fa';

export default function GitHubButton() {
  return (
    <Link
      href="http://localhost:8000/api/auth/github/login"
      className="flex items-center justify-center gap-2 w-full py-3 rounded-lg 
                 bg-black hover:bg-neutral-900 text-white font-semibold 
                 transition-colors text-center"
    >
      <FaGithub size={20} />
      Sign in with GitHub
    </Link>
  );
}
