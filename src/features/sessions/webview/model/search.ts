/**
 * The one way a search starts, shared by the sidebar's search box and the
 * explorer's. A query matches the list's own haystack (names, prompts,
 * project, branch) at once; past FULLTEXT_MIN_CHARS it also asks the host to
 * scan transcripts, whose hits arrive as `fullTextResults` and are kept only
 * while they still answer the live query (see `setFullTextHits`).
 */
import { sendSearchFullText } from "../api";
import {
  FULLTEXT_MIN_CHARS,
  clearFullTextHits,
  markFullTextLoading,
  searchQuerySignal,
} from "./signals";

export function applySearchQuery(raw: string): void {
  const q = raw.trim().toLowerCase();
  searchQuerySignal.value = q;
  if (q.length >= FULLTEXT_MIN_CHARS) {
    markFullTextLoading();
    sendSearchFullText(q);
  } else {
    clearFullTextHits();
  }
}
