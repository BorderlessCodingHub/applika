import type { AxiosError } from "axios";

import { apiErrorMessage, unknownErrorMessage } from "@/lib/api-error-message";

/**
 * `getApiError` for a request made with `responseType: "blob"`.
 *
 * axios honours `responseType` for the ERROR body too, so a 404 or a 500 on a
 * PDF download arrives as a `Blob` holding the JSON, not as the parsed object.
 * `getApiError` reads `detail` straight off `response.data` and would hand the
 * toast `undefined`. This reads the bytes back first.
 *
 * Once parsed, the body goes through the same chain as `getApiError`
 * (`lib/api-error-message.ts`): the `code` in the active language, else a
 * non-empty string `detail`, else the generic line. A 422's `detail` array
 * never reaches a toast as `[object Object]`.
 *
 * It lives here rather than in `api-client.ts` so it can be used — and tested —
 * without dragging in the axios singleton, which imports the service container
 * and is therefore circular with every service that would need this.
 */
/**
 * The text of a `Blob`.
 *
 * `Blob.prototype.text()` is the whole story in a real browser. The
 * `FileReader` branch is for environments that ship `Blob` WITHOUT it — jsdom
 * 20, which the component suite runs on, is one — so an error body can be read
 * back under test exactly as it is in production.
 */
function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export async function getBlobApiError(error: AxiosError): Promise<string> {
  const data = error.response?.data;
  if (!data) return unknownErrorMessage();

  let payload: unknown = data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try {
      payload = JSON.parse(await readBlobText(data));
    } catch {
      // An empty body, or a gateway's own HTML error page.
      return unknownErrorMessage();
    }
  }

  return apiErrorMessage(payload);
}
