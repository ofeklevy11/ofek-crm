import bidiFactory from "bidi-js";

// Initialize the bidi-js instance
const bidi = bidiFactory();

/**
 * Converts logical text (which might be RTL) to visual text
 * suitable for rendering in environments that don't support RTL (like react-pdf).
 *
 * Uses proper Bidi algorithm to reverse Hebrew text while keeping numbers
 * and LTR runs in valid order, and fixing punctuation.
 */
export const toVisual = (text: string | null | undefined): string => {
  if (!text) return "";

  return text
    .split("\n")
    .map((line) => {
      // We pass { level: 1 } to force the base direction to be RTL.
      // This ensures that punctuation at the end of a sentence (logical end)
      // appears at the correct visual position (left side of the sentence),
      // and that mixed text is ordered correctly for RTL context.
      return bidi.getReorderedString(line, { level: 1 });
    })
    .join("\n");
};
