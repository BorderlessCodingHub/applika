"use client";

import React from "react";

interface FetchErrorProps {
  message?: string;
  retry?: () => void;
}

export default function FetchError({ message, retry }: FetchErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center border border-white/20 rounded-xl bg-white/5 backdrop-blur-md">
      <p className="text-red-400 text-lg font-semibold mb-4">
        {message || "Failed to load data"}
      </p>
      {retry && (
        <button
          onClick={retry}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
