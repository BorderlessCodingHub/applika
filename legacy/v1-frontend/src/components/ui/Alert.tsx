export default function Alert({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <div
      className={`p-3 rounded-lg mb-3 text-sm ${
        type === "success"
          ? "bg-green-500/20 border border-green-500 text-green-300"
          : "bg-red-500/20 border border-red-500 text-red-300"
      }`}
    >
      {message}
    </div>
  );
}
