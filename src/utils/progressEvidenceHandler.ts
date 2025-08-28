import { supabase } from "../lib/supabase";

export interface ProgressEvidenceUpload {
  file: File;
  workDetailsId: number;
  reportDate: string;
}

export interface ProgressEvidenceResponse {
  success: boolean;
  storagePath?: string;
  publicUrl?: string;
  error?: string;
}

/**
 * Check if progress_evidence bucket exists and create if needed
 */
async function ensureBucketExists(): Promise<boolean> {
  try {
    // First, try to list buckets to see if progress_evidence exists
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets();

    if (listError) {
      console.error("Error listing buckets:", listError);
      return false;
    }

    const bucketExists = buckets?.some(
      (bucket) => bucket.name === "progress_evidence"
    );

    if (bucketExists) {
      console.log("progress_evidence bucket exists");
      return true;
    }

    console.log("progress_evidence bucket not found, attempting to create...");

    // Try to create the bucket (private, not public)
    const { data: createData, error: createError } =
      await supabase.storage.createBucket("progress_evidence", {
        public: false, // Changed to false for private bucket
        allowedMimeTypes: [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif",
          "image/webp",
        ],
        fileSizeLimit: 10485760, // 10MB
      });

    if (createError) {
      console.error("Error creating bucket:", createError);
      return false;
    }

    console.log("progress_evidence bucket created successfully:", createData);
    return true;
  } catch (error) {
    console.error("Error in ensureBucketExists:", error);
    return false;
  }
}

/**
 * Upload progress evidence file to Supabase storage
 */
export async function uploadProgressEvidence({
  file,
  workDetailsId,
  reportDate,
}: ProgressEvidenceUpload): Promise<ProgressEvidenceResponse> {
  try {
    // Validate file
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { success: false, error: "File size must be less than 10MB" };
    }

    // Check file type (images only)
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: "Only image files are allowed (JPEG, PNG, GIF, WebP)",
      };
    }

    // Ensure bucket exists
    const bucketReady = await ensureBucketExists();
    if (!bucketReady) {
      return {
        success: false,
        error: "Storage bucket is not available. Please contact administrator.",
      };
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `work_${workDetailsId}_${reportDate}_${timestamp}.${fileExtension}`;
    const storagePath = `${fileName}`; // Remove progress_evidence/ prefix since it's already the bucket name

    console.log("Uploading progress evidence:", {
      fileName,
      storagePath,
      fileSize: file.size,
      fileType: file.type,
    });

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("progress_evidence")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Generate a signed URL instead of public URL for initial verification
    const signedUrl = await getProgressEvidenceSignedUrl(uploadData.path, 3600);

    console.log("Progress evidence uploaded successfully:", {
      storagePath: uploadData.path,
      signedUrl: signedUrl ? "Generated successfully" : "Failed to generate",
    });

    return {
      success: true,
      storagePath: uploadData.path,
      publicUrl: signedUrl || "", // Use signed URL as "public" URL for now
    };
  } catch (error) {
    console.error("Error uploading progress evidence:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

/**
 * Get signed URL for progress evidence file (MAIN METHOD - use this instead of public URL)
 */
export async function getProgressEvidenceSignedUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("progress_evidence")
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error("Error in getProgressEvidenceSignedUrl:", error);
    return null;
  }
}

/**
 * Get public URL for progress evidence file (DEPRECATED - use signed URL instead)
 */
export function getProgressEvidenceUrl(storagePath: string): string {
  console.warn(
    "getProgressEvidenceUrl is deprecated for private buckets. Use getProgressEvidenceSignedUrl instead."
  );
  const { data } = supabase.storage
    .from("progress_evidence")
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Open progress evidence file in new tab/window
 * Uses signed URL with authentication
 */
export async function openProgressEvidence(storagePath: string): Promise<void> {
  try {
    console.log("Opening progress evidence:", storagePath);

    // Generate signed URL with 30 minutes expiration for viewing
    const signedUrl = await getProgressEvidenceSignedUrl(storagePath, 1800);

    if (!signedUrl) {
      throw new Error("Failed to generate signed URL for progress evidence");
    }

    console.log("Opening signed URL:", signedUrl);
    window.open(signedUrl, "_blank");
  } catch (error) {
    console.error("Error opening progress evidence:", error);
    throw error;
  }
}

/**
 * Download progress evidence file with a temporary signed URL
 */
export async function downloadProgressEvidence(
  storagePath: string,
  fileName?: string
): Promise<void> {
  try {
    const signedUrl = await getProgressEvidenceSignedUrl(storagePath, 300); // 5 minutes for download

    if (!signedUrl) {
      throw new Error("Failed to generate download URL");
    }

    // Create a temporary link and trigger download
    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = fileName || storagePath.split("/").pop() || "evidence.jpg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error downloading evidence:", error);
    throw error;
  }
}

/**
 * Delete progress evidence file from storage
 */
export async function deleteProgressEvidence(
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage
      .from("progress_evidence")
      .remove([storagePath]);

    if (error) {
      console.error("Delete error:", error);
      return { success: false, error: error.message };
    }

    console.log("Progress evidence deleted successfully:", storagePath);
    return { success: true };
  } catch (error) {
    console.error("Error deleting progress evidence:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
}

/**
 * Check if progress evidence file exists
 */
export async function checkProgressEvidenceExists(
  storagePath: string
): Promise<boolean> {
  try {
    const pathParts = storagePath.split("/");
    const fileName = pathParts.pop();
    const folderPath = pathParts.join("/");

    const { data, error } = await supabase.storage
      .from("progress_evidence")
      .list(folderPath || undefined, {
        search: fileName,
      });

    if (error) {
      console.error("Error checking file existence:", error);
      return false;
    }

    return data.some((file) => file.name === fileName);
  } catch (error) {
    console.error("Error in checkProgressEvidenceExists:", error);
    return false;
  }
}

/**
 * Validates if a file is suitable for progress evidence upload
 */
export const validateProgressEvidenceFile = (
  file: File
): {
  isValid: boolean;
  error?: string;
} => {
  // Check file type
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: "Only image files are allowed (JPEG, PNG, GIF, WebP)",
    };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: "File size must be less than 10MB",
    };
  }

  // Check filename length
  if (file.name.length > 100) {
    return {
      isValid: false,
      error: "Filename is too long (max 100 characters)",
    };
  }

  return { isValid: true };
};
