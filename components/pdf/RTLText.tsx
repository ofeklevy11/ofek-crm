import React, { FC } from "react";
import { Text, View, TextProps } from "@react-pdf/renderer";

interface RTLTextProps extends TextProps {
  children: string | number | null | undefined;
}

// פיצול מלא: מילים / פיסוק / רווחים
const TOKENIZER_REGEX = /([.,:;!?%/]| +)/;

const RTLText: FC<RTLTextProps> = ({ children, style, ...props }) => {
  const text = String(children || "");

  // טיפול ב־newline
  if (text.includes("\n")) {
    return (
      <View style={{ flexDirection: "column" }}>
        {text.split("\n").map((line, i) => (
          <RTLText key={i} style={style} {...props}>
            {line}
          </RTLText>
        ))}
      </View>
    );
  }

  const tokens = text.split(TOKENIZER_REGEX).filter(Boolean);

  return (
    <View
      style={{
        flexDirection: "row-reverse",
        flexWrap: "wrap",
        justifyContent: "flex-start",
        width: "100%",
      }}
    >
      {tokens.map((token, index) => {
        const isSpace = token.trim() === "";

        return (
          <Text
            key={index}
            style={[
              style,
              isSpace && { marginLeft: 4 }, // רווח ויזואלי יציב
            ]}
            {...props}
          >
            {isSpace ? "" : token}
          </Text>
        );
      })}
    </View>
  );
};

export default RTLText;
