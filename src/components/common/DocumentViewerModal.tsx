import { useEffect } from "react";
import { Download, ExternalLink, FileText, Lock, X } from "lucide-react";

interface DocumentViewerModalProps {
  title: string;
  url: string;
  // Used only to pick the preview type (pdf / image) and download filename.
  storagePath: string;
  onClose: () => void;
}

// Same look as the document viewer modal on the Invoice pages, for a signed
// storage URL (5-minute expiry).
export default function DocumentViewerModal({
  title,
  url,
  storagePath,
  onClose,
}: DocumentViewerModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const extension = storagePath.split(".").pop()?.toLowerCase() || "";
  const fileType =
    extension === "pdf"
      ? "pdf"
      : ["jpg", "jpeg", "png", "gif"].includes(extension)
        ? "image"
        : "unknown";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" /> {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          {fileType === "pdf" ? (
            <div className="w-full h-[70vh] bg-white rounded-lg overflow-hidden">
              <iframe
                src={`${url}#view=FitH`}
                className="w-full h-full border-0"
                title={`${title} Viewer`}
              />
            </div>
          ) : fileType === "image" ? (
            <div className="flex items-center justify-center">
              <img
                src={url}
                alt={title}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full py-10">
              <div className="text-center">
                <p className="text-gray-600 mb-4 text-lg flex items-center gap-2 justify-center">
                  <FileText className="w-5 h-5" /> Cannot preview this file
                  type in browser
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-block"
                >
                  Open in New Tab
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-white">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Secure signed URL - Expires in 5
            minutes
          </p>
          <div className="flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 text-sm font-medium"
            >
              <ExternalLink className="w-4 h-4" /> New Tab
            </a>
            <a
              href={url}
              download={`${title.replace(/\s+/g, "-")}.${extension || "pdf"}`}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 inline-flex items-center gap-2 text-sm font-medium"
            >
              <Download className="w-4 h-4" /> Download
            </a>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
