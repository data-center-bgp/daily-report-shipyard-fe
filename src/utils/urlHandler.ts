import { supabase } from "../lib/supabase";

/**
 * Generates a signed URL for accessing a file in the work_permit bucket
 * @param storagePath - The path to the file in storage
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Promise<string | null> - The signed URL or null if error
 */
export const getPermitFileUrl = async (
  storagePath: string,
  expiresIn: number = 3600 // 1 hour default
): Promise<string | null> => {
  try {
    const { data, error } = await supabase.storage
      .from("work_permit") // Updated bucket name
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error("Error in getPermitFileUrl:", error);
    return null;
  }
};

/**
 * Downloads a permit file with a temporary signed URL
 * @param storagePath - The path to the file in storage
 * @param fileName - The name to save the file as
 */
export const downloadPermitFile = async (
  storagePath: string,
  fileName?: string
): Promise<void> => {
  try {
    const signedUrl = await getPermitFileUrl(storagePath, 300); // 5 minutes for download

    if (!signedUrl) {
      throw new Error("Failed to generate download URL");
    }

    // Create a temporary link and trigger download
    const link = document.createElement("a");
    link.href = signedUrl;
    link.download = fileName || storagePath.split("/").pop() || "permit.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error downloading file:", error);
    throw error;
  }
};

/**
 * Opens a permit file in a new tab with a temporary signed URL
 * @param storagePath - The path to the file in storage
 */
export const openPermitFile = async (storagePath: string): Promise<void> => {
  try {
    const signedUrl = await getPermitFileUrl(storagePath, 1800); // 30 minutes for viewing

    if (!signedUrl) {
      throw new Error("Failed to generate view URL");
    }

    window.open(signedUrl, "_blank");
  } catch (error) {
    console.error("Error opening file:", error);
    throw error;
  }
};

/**
 * Checks if a file exists in the work_permit bucket
 * @param storagePath - The path to check
 * @returns Promise<boolean> - True if file exists
 */
export const checkPermitFileExists = async (
  storagePath: string
): Promise<boolean> => {
  try {
    const pathParts = storagePath.split("/");
    const fileName = pathParts.pop();
    const folderPath = pathParts.join("/");

    const { data, error } = await supabase.storage
      .from("work_permit") // Updated bucket name
      .list(folderPath || undefined, {
        search: fileName,
      });

    if (error) {
      console.error("Error checking file existence:", error);
      return false;
    }

    return data.some((file) => file.name === fileName);
  } catch (error) {
    console.error("Error in checkPermitFileExists:", error);
    return false;
  }
};
