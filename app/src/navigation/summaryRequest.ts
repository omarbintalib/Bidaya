/**
 * The header's "Sirah summary" button asks the Journey to open its summary: at once if the Journey is showing, or
 * once it has loaded after the page changes to it (the request waits in sessionStorage until then).
 */
const KEY = 'bidaya.summary.open';
export const SUMMARY_EVENT = 'bidaya:summary';

export function requestSummary() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable: the event below still reaches an open Journey */ }
  window.dispatchEvent(new Event(SUMMARY_EVENT));
}

/** Whether the summary was asked for (and clears the request). */
export function takeSummaryRequest() {
  try { const asked = sessionStorage.getItem(KEY) === '1'; sessionStorage.removeItem(KEY); return asked; } catch { return false; }
}
