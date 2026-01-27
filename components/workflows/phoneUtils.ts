function formatPhonePreview(phone: string, type: "private" | "group") {
  if (!phone) return "";
  let clean = phone.trim();
  if (type === "group") {
    if (!clean.endsWith("@g.us")) return clean + "@g.us";
    return clean;
  }
  // Private
  clean = clean.replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "972" + clean.substring(1);
  if (!clean.endsWith("@c.us")) clean = clean + "@c.us";
  return clean;
}
