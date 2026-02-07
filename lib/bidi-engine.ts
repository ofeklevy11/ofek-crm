import bidiFactory from "bidi-js";

let bidi: any = null;
const HEBREW_RE = /[\u0590-\u05FF]/;

function getBidi() {
  if (!bidi) bidi = bidiFactory();
  return bidi;
}

// סימני פיסוק בעייתיים
const TRAILING_PUNCTUATION = /([.:*])$/;

export function toVisual(text?: string | null): string {
  if (!text) return "";

  try {
    const engine = getBidi();

    return text
      .split("\n")
      .map((line) => {
        if (!HEBREW_RE.test(line)) return line;

        let fixedLine = line;

        // 🧨 אם יש פיסוק בסוף — מעבירים אותו להתחלה
        const match = fixedLine.match(TRAILING_PUNCTUATION);
        if (match) {
          const punct = match[1];
          fixedLine =
            punct + " " + fixedLine.slice(0, -1);
        }

        // עכשיו עושים reorder רגיל
        return engine.getReorderedString(fixedLine, {
          level: 1,
        });
      })
      .join("\n");
  } catch {
    return text;
  }
}
