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

export async function uploadProgressEvidence({
  file,
  workDetailsId,
  reportDate,
}: ProgressEvidenceUpload): Promise<ProgressEvidenceResponse> {
  try {
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    const validation = validateProgressEvidenceFile(file);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `work_${workDetailsId}_${reportDate}_${timestamp}_${randomSuffix}.${fileExtension}`;

    const storagePath = `work-details-${workDetailsId}/${fileName}`;

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

    const signedUrl = await getProgressEvidenceSignedUrl(uploadData.path, 3600);

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

export async function openProgressEvidence(storagePath: string): Promise<void> {
  try {
    const signedUrl = await getProgressEvidenceSignedUrl(storagePath, 1800);

    if (!signedUrl) {
      throw new Error("Failed to generate signed URL for progress evidence");
    }

    window.open(signedUrl, "_blank");
  } catch (error) {
    console.error("Error opening progress evidence:", error);
    throw error;
  }
}

export async function downloadProgressEvidence(
  storagePath: string,
  fileName?: string
): Promise<void> {
  try {
    const signedUrl = await getProgressEvidenceSignedUrl(storagePath, 300);

    if (!signedUrl) {
      throw new Error("Failed to generate download URL");
    }

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

export const validateProgressEvidenceFile = (
  file: File
): {
  isValid: boolean;
  error?: string;
} => {
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

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: "File size must be less than 10MB",
    };
  }

  if (file.name.length > 100) {
    return {
      isValid: false,
      error: "Filename is too long (max 100 characters)",
    };
  }

  return { isValid: true };
};
