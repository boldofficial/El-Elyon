import React, { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

type Props = {
  onCapture: (storageId: Id<"_storage">) => void;
  onCancel: () => void;
};

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export default function SelfieCapture({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generateUploadUrl = useMutation(api.care.generateSelfieUploadUrl);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (e) {
        setError("Camera access denied or unavailable.");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setIsUploading(true);
    setError(null);
    try {
      // 1. Capture image from video with compression
      const canvas = document.createElement("canvas");
      const maxWidth = 320;
      const maxHeight = 240;
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      const aspectRatio = videoWidth / videoHeight;
      
      let width = maxWidth;
      let height = maxHeight;
      if (aspectRatio > maxWidth / maxHeight) {
        height = maxWidth / aspectRatio;
      } else {
        width = maxHeight * aspectRatio;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");
      ctx.drawImage(videoRef.current, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const blob = dataURLtoBlob(dataUrl);

      // 2. Get upload URL from backend
      const uploadUrl = await generateUploadUrl();

      // 3. Upload the image
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!res.ok) {
        throw new Error("Failed to upload selfie");
      }
      const { storageId } = await res.json();
      if (!storageId) throw new Error("No storageId returned from upload");

      // 4. Pass storageId to parent
      onCapture(storageId);
    } catch (e: any) {
      setError(e.message || "Failed to capture/upload selfie");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {error && (
        <div className="text-red-600 bg-red-100 px-4 py-2 rounded">{error}</div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="rounded shadow w-64 h-48 bg-black"
      />
      <div className="flex gap-2">
        <button
          className="button bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          onClick={handleCapture}
          type="button"
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Capture Selfie"}
        </button>
        <button
          className="button bg-gray-300 text-gray-700 px-4 py-2 rounded"
          onClick={onCancel}
          type="button"
          disabled={isUploading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}