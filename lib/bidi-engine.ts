import bidiFactory from "bidi-js";

let bidi: any = null;

const initBidi = () => {
  if (!bidi) {
    bidi = bidiFactory();
  }
  return bidi;
};

/**
 * Converts logical text (which might be RTL) to visual text
 * suitable for rendering in environments that don't support RTL (like react-pdf).
 */
export const toVisual = (text: string | null | undefined): string => {
  if (!text) return "";

  // Helper to process a single line
  const processLine = (line: string): string => {
    try {
      const bidiEngine = initBidi();

      // Check if the text actually contains Hebrew characters
      const hasHebrew = /[\u0590-\u05FF]/.test(line);

      // If no Hebrew/Arabic, usually return as is (LTR)
      if (!hasHebrew) {
        return line;
      }

      // Use RTL base direction (level 1) if Hebrew is present
      // bidi-js typically accepts a configuration object { level: 1 } or similar for visual reordering.
      // Based on common usage: getReorderedString(text, options)

      let result = extractResult(
        bidiEngine.getReorderedString(line, {
          level: 1, // Force RTL base direction for Hebrew lines
        }),
      );

      // Some versions of bidi-js might return the result in a different format
      // but commonly it's a string.

      return result;
    } catch (err) {
      console.error("Bidi processing error:", err);
      // Fallback: reverse words manually or just return line?
      // Better to return line than crash.
      return line;
    }
  };

  return text.split("\n").map(processLine).join("\n");
};

function extractResult(res: any): string {
  if (typeof res === "string") return res;
  if (res && typeof res.text === "string") return res.text;
  return String(res);
}
