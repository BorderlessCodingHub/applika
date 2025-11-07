import { useState } from "react";

export type FlashCategory = "success" | "error" | "warning";

export function useProfile() {
  const [flashMessage, setFlashMessage] = useState<{
    category: FlashCategory;
    message: string;
  } | null>(null);

  function showMessage(category: FlashCategory, message: string) {
    setFlashMessage({ category, message });
  }

  function clearMessage() {
    setFlashMessage(null);
  }

  return {
    flashMessage,
    showMessage,
    clearMessage,
  };
}
