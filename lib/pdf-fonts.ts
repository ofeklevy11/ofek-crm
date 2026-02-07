import { Font } from "@react-pdf/renderer";
import path from "path";

let areFontsRegistered = false;

export const registerFonts = () => {
  if (areFontsRegistered) return;

  // Use process.cwd() as requested to locate fonts in the project root
  const fontPathRegular = path.join(
    process.cwd(),
    "pdf",
    "static",
    "Rubik-Regular.ttf",
  );
  const fontPathBold = path.join(
    process.cwd(),
    "pdf",
    "static",
    "Rubik-Bold.ttf",
  );

  // Register the font with a name that matches the family used in styles
  Font.register({
    family: "Rubik",
    fonts: [
      {
        src: fontPathRegular,
        fontWeight: "normal",
      },
      {
        src: fontPathBold,
        fontWeight: "bold",
      },
    ],
  });

  areFontsRegistered = true;
};
