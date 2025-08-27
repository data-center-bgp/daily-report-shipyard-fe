import { supabase } from "../lib/supabase";

/**
 * Uploads a file to the work_permit bucket
 * @param file - The file to upload
 * @param customPath - Optional custom path, if not provided will generate one
 * @returns Promise<{success: boolean, storagePath?: string, publicUrl?: string, error?: string}>
 */
export const uploadWorkPermitFile = async (
  file: File,
  customPath?: string
): Promise<{
  success: boolean;
  storagePath?: string;
  publicUrl?: string;
  error?: string;
}> => {
  try {
    // Validate file type (only allow PDF files)
    if (file.type !== "application/pdf") {
      return {
        success: false,
        error: "Only PDF files are allowed for work permits",
      };
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: "File size must be less than 10MB",
      };
    }

    // Generate storage path if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_"); // Sanitize filename
    const storagePath = customPath || `permits/${timestamp}_${fileName}`;

    console.log("Uploading file to:", storagePath);

    // Upload file to Supabase storage
    const { data, error } = await supabase.storage
      .from("work_permit")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false, // Don't overwrite existing files
      });

    if (error) {
      console.error("Upload error:", error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }

    // Get public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from("work_permit")
      .getPublicUrl(storagePath);

    console.log("File uploaded successfully:", data);

    return {
      success: true,
      storagePath: data.path,
      publicUrl: publicUrlData.publicUrl,
    };
  } catch (error) {
    console.error("Error in uploadWorkPermitFile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
};

/**
 * Deletes a file from the work_permit bucket
 * @param storagePath - The path of the file to delete
 * @returns Promise<{success: boolean, error?: string}>
 */
export const deleteWorkPermitFile = async (
  storagePath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.storage
      .from("work_permit")
      .remove([storagePath]);

    if (error) {
      console.error("Delete error:", error);
      return {
        success: false,
        error: `Delete failed: ${error.message}`,
      };
    }

    console.log("File deleted successfully:", storagePath);
    return { success: true };
  } catch (error) {
    console.error("Error in deleteWorkPermitFile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Delete failed",
    };
  }
};

/**
 * Replaces an existing work permit file
 * @param oldStoragePath - Path of the old file to replace
 * @param newFile - New file to upload
 * @param customPath - Optional custom path for the new file
 * @returns Promise<{success: boolean, storagePath?: string, publicUrl?: string, error?: string}>
 */
export const replaceWorkPermitFile = async (
  oldStoragePath: string,
  newFile: File,
  customPath?: string
): Promise<{
  success: boolean;
  storagePath?: string;
  publicUrl?: string;
  error?: string;
}> => {
  try {
    // Upload new file first
    const uploadResult = await uploadWorkPermitFile(newFile, customPath);

    if (!uploadResult.success) {
      return uploadResult;
    }

    // Delete old file (don't fail the operation if this fails)
    const deleteResult = await deleteWorkPermitFile(oldStoragePath);
    if (!deleteResult.success) {
      console.warn("Failed to delete old file:", deleteResult.error);
      // Continue anyway since the new file was uploaded successfully
    }

    return uploadResult;
  } catch (error) {
    console.error("Error in replaceWorkPermitFile:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Replace failed",
    };
  }
};

/**
 * Gets file info from storage
 * @param storagePath - The path of the file
 * @returns Promise<{exists: boolean, size?: number, lastModified?: string, error?: string}>
 */
export const getWorkPermitFileInfo = async (
  storagePath: string
): Promise<{
  exists: boolean;
  size?: number;
  lastModified?: string;
  error?: string;
}> => {
  try {
    const pathParts = storagePath.split("/");
    const fileName = pathParts.pop();
    const folderPath = pathParts.join("/");

    const { data, error } = await supabase.storage
      .from("work_permit")
      .list(folderPath || undefined, {
        search: fileName,
      });

    if (error) {
      console.error("Error getting file info:", error);
      return {
        exists: false,
        error: error.message,
      };
    }

    const file = data?.find((f) => f.name === fileName);

    if (!file) {
      return { exists: false };
    }

    return {
      exists: true,
      size: file.metadata?.size,
      lastModified: file.updated_at || file.created_at,
    };
  } catch (error) {
    console.error("Error in getWorkPermitFileInfo:", error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Failed to get file info",
    };
  }
};

/**
 * Validates if a file is suitable for work permit upload
 * @param file - The file to validate
 * @returns {isValid: boolean, error?: string}
 */
export const validateWorkPermitFile = (
  file: File
): {
  isValid: boolean;
  error?: string;
} => {
  // Check file type
  if (file.type !== "application/pdf") {
    return {
      isValid: false,
      error: "Only PDF files are allowed for work permits",
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
