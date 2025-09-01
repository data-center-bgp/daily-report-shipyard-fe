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

    // Validate file using the validation function
    const validation = validateProgressEvidenceFile(file);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `work_${workDetailsId}_${reportDate}_${timestamp}_${randomSuffix}.${fileExtension}`;

    // Create folder structure: work-details-{id}/filename
    const storagePath = `work-details-${workDetailsId}/${fileName}`;

    console.log("Uploading progress evidence:", {
      fileName,
      storagePath,
      fileSize: file.size,
      fileType: file.type,
      workDetailsId,
      reportDate,
    });

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("progress_evidence")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false, // Don't overwrite existing files
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Generate a signed URL for the uploaded file
    const signedUrl = await getProgressEvidenceSignedUrl(uploadData.path, 3600);

    console.log("Progress evidence uploaded successfully:", {
      storagePath: uploadData.path,
      signedUrl: signedUrl ? "Generated successfully" : "Failed to generate",
    });

    return {
      success: true,
      storagePath: uploadData.path,
      publicUrl: signedUrl || "",
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
 * Get signed URL for progress evidence file
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
 * Open progress evidence file in new tab/window
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
