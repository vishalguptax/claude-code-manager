/**
 * Chunk-boundary-safe line decoding for the streaming JSONL readers.
 *
 * Every transcript reader in the codebase reads a file in fixed-size byte
 * chunks and splits the decoded text on newlines. Decoding each chunk
 * independently — `buf.toString("utf-8", 0, bytesRead)` — corrupts any
 * multi-byte character that straddles the boundary: the trailing partial
 * sequence decodes to U+FFFD, and the orphaned continuation bytes at the
 * start of the next chunk decode to one U+FFFD each. A single CJK
 * character split across a 64 KB boundary comes back as three replacement
 * characters, silently, in whatever the user then reads on screen.
 *
 * `StringDecoder` exists for exactly this: it holds incomplete trailing
 * byte sequences back until the next chunk completes them.
 *
 * Only the decode-and-split step is shared. The readers differ in the
 * parts that matter to them — positional reads, byte-offset tracking,
 * early termination on a budget, yielding to the event loop between
 * chunks — so folding them into one loop would trade a real bug for a
 * pile of options. Each keeps its own control flow and borrows the one
 * step they were all getting wrong.
 */
import { StringDecoder } from "node:string_decoder";

export interface LineDecoder {
  /**
   * Feed the first `bytesRead` bytes of `buf` and return every COMPLETE
   * line they finish. A trailing partial line is retained, as is a
   * trailing partial UTF-8 sequence.
   */
  push(buf: Buffer, bytesRead: number): string[];
  /**
   * The final partial line, after the last chunk. Empty string when the
   * input ended on a newline.
   *
   * Any bytes still held back as an incomplete UTF-8 sequence are flushed
   * here as replacement characters — at true end-of-input those bytes are
   * genuinely malformed, rather than merely unfinished, and dropping them
   * silently would be worse than showing them.
   */
  end(): string;
}

export function createLineDecoder(): LineDecoder {
  const decoder = new StringDecoder("utf-8");
  let leftover = "";

  return {
    push(buf: Buffer, bytesRead: number): string[] {
      // `decoder.write` takes a Buffer; subarray avoids copying the
      // unused tail of the read buffer on a short read.
      const chunk = leftover + decoder.write(buf.subarray(0, bytesRead));
      const lines = chunk.split("\n");
      // The last element is either an incomplete line or "" when the
      // chunk ended exactly on a newline. Either way it carries over.
      leftover = lines.pop() ?? "";
      return lines;
    },
    end(): string {
      const rest = leftover + decoder.end();
      leftover = "";
      return rest;
    },
  };
}
