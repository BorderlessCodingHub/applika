import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/20 mt-auto">
      <div className="max-w-7xl mx-auto text-center py-4 px-4">
        <p className="text-white/80 text-sm">
          Coded by{" "}
          {/* <Link
            href="https://github.com/brxnnox"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white hover:text-violet-600 transition-colors"
          >
            @brxnnox
          </Link> */}
        </p>
      </div>
    </footer>
  );
}
