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
    if (file.type !== "application/pdf") {
      return {
        success: false,
        error: "Only PDF files are allowed for work permits",
      };
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        error: "File size must be less than 10MB",
      };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = customPath || `permits/${timestamp}_${fileName}`;

    const { data, error } = await supabase.storage
      .from("work_permit")
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }

    const { data: publicUrlData } = supabase.storage
      .from("work_permit")
      .getPublicUrl(storagePath);

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
    const uploadResult = await uploadWorkPermitFile(newFile, customPath);

    if (!uploadResult.success) {
      return uploadResult;
    }

    const deleteResult = await deleteWorkPermitFile(oldStoragePath);
    if (!deleteResult.success) {
      console.warn("Failed to delete old file:", deleteResult.error);
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
  if (file.type !== "application/pdf") {
    return {
      isValid: false,
      error: "Only PDF files are allowed for work permits",
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
