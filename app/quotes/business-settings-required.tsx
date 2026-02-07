"use client";

import { useState, useRef } from "react";
import {
  Building2,
  Save,
  AlertCircle,
  Globe,
  Mail,
  MapPin,
  FileText,
  Check,
  ImagePlus,
  X,
} from "lucide-react";
import {
  updateBusinessSettings,
  BusinessSettings,
} from "@/app/actions/business-settings";
import { saveFileMetadata } from "@/app/actions/storage";
import { useRouter } from "next/navigation";
import { useUploadThing } from "@/lib/uploadthing";

interface Props {
  initialSettings: BusinessSettings | null;
  onSaved?: () => void;
}

const BUSINESS_TYPES = [
  { value: "exempt", label: "עוסק פטור" },
  { value: "licensed", label: "עוסק מורשה" },
  { value: "ltd", label: "חברה בע״מ" },
];

export default function BusinessSettingsRequired({ initialSettings, onSaved }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: initialSettings?.name || "",
    businessType: initialSettings?.businessType || "",
    taxId: initialSettings?.taxId || "",
    businessAddress: initialSettings?.businessAddress || "",
    businessWebsite: initialSettings?.businessWebsite || "",
    businessEmail: initialSettings?.businessEmail || "",
    logoUrl: initialSettings?.logoUrl || "",
  });

  const [logoPreview, setLogoPreview] = useState<string>(initialSettings?.logoUrl || "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("companyFiles");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate it's an image
    if (!file.type.startsWith("image/")) {
      alert("נא לבחור קובץ תמונה בלבד");
      return;
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl);

    setUploadingLogo(true);
    try {
      const res = await startUpload([file]);
      if (res && res[0]) {
        const uploaded = res[0];
        // Explicitly save file to /files so it appears there
        await saveFileMetadata(
          {
            name: uploaded.name,
            url: uploaded.url,
            key: uploaded.key,
            size: uploaded.size,
            type: uploaded.type || file.type || "image/png",
            source: "לוגו של הגדרות עסק (הצעות מחיר)",
          },
          null, // folderId = null (root)
        );
        setFormData((prev) => ({ ...prev, logoUrl: uploaded.url }));
        setLogoPreview(uploaded.url);
      }
    } catch (error) {
      console.error("Logo upload failed:", error);
      alert("שגיאה בהעלאת הלוגו");
      setLogoPreview(formData.logoUrl);
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    setFormData((prev) => ({ ...prev, logoUrl: "" }));
    setLogoPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.name ||
      !formData.businessType ||
      !formData.taxId ||
      !formData.businessAddress
    ) {
      alert("נא למלא את כל השדות החובה");
      return;
    }

    const finalFormData = { ...formData };
    if (
      finalFormData.businessWebsite &&
      !/^https?:\/\//i.test(finalFormData.businessWebsite)
    ) {
      finalFormData.businessWebsite = `https://${finalFormData.businessWebsite}`;
    }

    setLoading(true);
    try {
      await updateBusinessSettings(finalFormData);
      if (onSaved) {
        onSaved();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      alert("שגיאה בשמירת ההגדרות");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`${onSaved ? "" : "min-h-screen"} bg-[#f4f8f8] flex items-center justify-center p-6`}
      dir="rtl"
    >
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] p-8 text-white">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">הגדרות עסק</h1>
                <p className="text-white/80 mt-1">
                  לפני יצירת הצעות מחיר, יש להגדיר את פרטי העסק
                </p>
              </div>
            </div>
          </div>

          {/* Alert */}
          <div className="mx-6 mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">שדות חובה</p>
              <p className="mt-1">
                יש למלא את סוג העוסק, ח.פ/מספר עוסק וכתובת העסק כדי להתחיל ליצור
                הצעות מחיר.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Logo Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                <ImagePlus className="w-4 h-4 inline ml-1" />
                לוגו העסק{" "}
                <span className="text-gray-400 text-xs">(אופציונלי)</span>
              </label>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img
                      src={logoPreview}
                      alt="לוגו העסק"
                      className="w-20 h-20 object-contain rounded-xl border border-gray-200 bg-white p-1"
                    />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-[#4f95ff] hover:text-[#4f95ff] transition-colors"
                  >
                    <ImagePlus className="w-6 h-6" />
                  </button>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                  />
                  {logoPreview ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm text-[#4f95ff] hover:underline"
                    >
                      {uploadingLogo ? "מעלה..." : "החלף לוגו"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm text-[#4f95ff] hover:underline"
                    >
                      {uploadingLogo ? "מעלה..." : "העלה לוגו"}
                    </button>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    גודל מומלץ: 300x300 פיקסלים. פורמט: PNG או SVG עם רקע שקוף.
                  </p>
                </div>
              </div>
            </div>

            {/* Business Name */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                שם העסק <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none bg-white transition-all"
                placeholder="לדוגמה: אופק קונקט בע״מ"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            {/* Business Type */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                סוג עוסק <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {BUSINESS_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, businessType: type.value })
                    }
                    className={`p-4 border-2 rounded-xl text-center transition-all ${
                      formData.businessType === type.value
                        ? "border-[#4f95ff] bg-[#4f95ff]/5 text-[#4f95ff]"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {formData.businessType === type.value && (
                        <Check className="w-4 h-4" />
                      )}
                      <span className="font-medium">{type.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tax ID */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                <FileText className="w-4 h-4 inline ml-1" />
                {formData.businessType === "ltd"
                  ? "ח.פ (חברה פרטית)"
                  : "מספר עוסק"}{" "}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none bg-white transition-all"
                placeholder={
                  formData.businessType === "ltd"
                    ? "לדוגמה: 51-234567-8"
                    : "לדוגמה: 123456789"
                }
                value={formData.taxId}
                onChange={(e) =>
                  setFormData({ ...formData, taxId: e.target.value })
                }
              />
            </div>

            {/* Business Address */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                <MapPin className="w-4 h-4 inline ml-1" />
                כתובת העסק <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none bg-white transition-all"
                placeholder="לדוגמה: רחוב הרצל 10, תל אביב"
                value={formData.businessAddress}
                onChange={(e) =>
                  setFormData({ ...formData, businessAddress: e.target.value })
                }
              />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-sm text-gray-500 mb-4">
                השדות הבאים הם אופציונליים. אם תמלא אותם, הם יופיעו בכל הצעות
                המחיר שלך.
              </p>
            </div>

            {/* Website (Optional) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                <Globe className="w-4 h-4 inline ml-1" />
                קישור לאתר אינטרנט{" "}
                <span className="text-gray-400 text-xs">(אופציונלי)</span>
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none bg-white transition-all"
                placeholder="לדוגמה: https://www.example.co.il"
                value={formData.businessWebsite}
                onChange={(e) =>
                  setFormData({ ...formData, businessWebsite: e.target.value })
                }
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && !/^https?:\/\//i.test(val)) {
                    setFormData({
                      ...formData,
                      businessWebsite: `https://${val}`,
                    });
                  }
                }}
              />
            </div>

            {/* Email (Optional) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                <Mail className="w-4 h-4 inline ml-1" />
                דוא״ל עסקי{" "}
                <span className="text-gray-400 text-xs">(אופציונלי)</span>
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#4f95ff] focus:border-[#4f95ff] outline-none bg-white transition-all"
                placeholder="לדוגמה: info@example.co.il"
                value={formData.businessEmail}
                onChange={(e) =>
                  setFormData({ ...formData, businessEmail: e.target.value })
                }
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || uploadingLogo}
              className="w-full py-4 bg-gradient-to-l from-[#4f95ff] to-[#a24ec1] text-white rounded-xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {loading ? "שומר..." : "שמור והמשך ליצירת הצעת מחיר"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
