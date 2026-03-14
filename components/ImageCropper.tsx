"use client";

import React, { useState, useRef, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Check, X, ZoomIn, ZoomOut, Move } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

interface ImageCropperProps {
  imageSrc: string;
  aspectRatio?: number; // width / height
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropper({
  imageSrc,
  aspectRatio = 1,
  onCropComplete,
  onCancel,
}: ImageCropperProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const focusTrapRef = useFocusTrap(onCancel);

  // Constants for the crop area size
  const CROP_SIZE = 300;
  const cropWidth = CROP_SIZE * aspectRatio;
  const cropHeight = CROP_SIZE;

  // Handle window-level mouse/touch events for smoother dragging
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;
      setPan({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y,
      });
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", handleEnd);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("touchend", handleEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, dragStart]);

  const startDrag = (clientX: number, clientY: number) => {
    setIsDragging(true);
    setDragStart({ x: clientX - pan.x, y: clientY - pan.y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleCrop = async () => {
    if (!imageRef.current) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to the desired output size (e.g., 500x500 for good quality)
    const OUTPUT_SIZE = 500;
    canvas.width = OUTPUT_SIZE * aspectRatio;
    canvas.height = OUTPUT_SIZE;

    // Calculate the portion of the image that is visible in the crop area
    // The visual crop area is cropWidth x cropHeight
    // The image is scaled by 'zoom' and translated by 'pan'

    // We need to map the canvas pixels to the image pixels

    // Visual center relative to container
    const visualCenterX = cropWidth / 2;
    const visualCenterY = cropHeight / 2;

    // Image center relative to image top-left (unscaled)
    const imgWidth = imageRef.current.naturalWidth;
    const imgHeight = imageRef.current.naturalHeight;
    const imgCenterX = imgWidth / 2;
    const imgCenterY = imgHeight / 2;

    // We want to draw the image into the canvas
    // Canvas context transformation:
    // 1. Translate to center of canvas
    // 2. Scale by zoom (and adjustment for output size vs visual size)
    // 3. Translate by pan
    // 4. Translate back by image center

    const scaleFactor = OUTPUT_SIZE / CROP_SIZE;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Move to center of canvas
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Apply panning (scaled up)
    ctx.translate(pan.x * scaleFactor, pan.y * scaleFactor);

    // Apply zoom
    ctx.scale(zoom * scaleFactor, zoom * scaleFactor);

    // Draw image centered
    ctx.drawImage(
      imageRef.current,
      -imgWidth / 2,
      -imgHeight / 2,
      imgWidth,
      imgHeight,
    );

    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, "image/png");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cropper-modal-title"
    >
      <div ref={focusTrapRef} className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 id="cropper-modal-title" className="font-bold text-lg">עריכת לוגו</h3>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
            aria-label="סגור"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto flex flex-col items-center gap-6">
          <p className="text-sm text-gray-500 text-center">
            השתמש בזום ובגרירה כדי למקם את הלוגו בתוך המסגרת, כך שייראה ברור
            וללא שוליים מיותרים.
          </p>

          <div
            className="relative overflow-hidden bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 shadow-inner cursor-move"
            aria-label="אזור גרירה למיקום הלוגו"
            style={{
              width: cropWidth,
              height: cropHeight,
            }}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {/* Grid overlay */}
            <div className="absolute inset-0 pointer-events-none z-10 opacity-30">
              <div className="absolute top-1/3 left-0 right-0 h-px bg-gray-400"></div>
              <div className="absolute top-2/3 left-0 right-0 h-px bg-gray-400"></div>
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-gray-400"></div>
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-gray-400"></div>
            </div>

            <img
              ref={imageRef}
              src={imageSrc}
              alt="תצוגה מקדימה של חיתוך"
              draggable={false}
              className="absolute max-w-none origin-center"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            />
          </div>

          <div className="w-full max-w-xs space-y-3">
            <div className="flex justify-between text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <ZoomOut className="w-4 h-4" aria-hidden="true" /> הקטן
              </span>
              <span className="flex items-center gap-1">
                הגדל <ZoomIn className="w-4 h-4" aria-hidden="true" />
              </span>
            </div>
            <Slider
              value={[zoom]}
              min={0.1}
              max={5}
              step={0.1}
              onValueChange={(val) => setZoom(val[0])}
              aria-label="זום"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
          <Button variant="outline" onClick={onCancel}>
            ביטול
          </Button>
          <Button
            onClick={handleCrop}
            className="bg-[#4f95ff] hover:bg-[#3d84ff]"
          >
            <Check className="w-4 h-4 ml-2" aria-hidden="true" />
            שמור לוגו
          </Button>
        </div>
      </div>
    </div>
  );
}
