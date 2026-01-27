import { createClient } from "@supabase/supabase-js";
import Busboy from "busboy";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse FormData using busboy
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    const busboy = Busboy({ headers: req.headers });

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];

      file.on('data', (data) => {
        chunks.push(data);
      });

      file.on('end', () => {
        files.push({
          buffer: Buffer.concat(chunks),
          filename,
          encoding,
          mimeType
        });
      });
    });

    busboy.on('finish', () => {
      resolve({ fields, files });
    });

    busboy.on('error', reject);

    req.pipe(busboy);
  });
}

// Upload single file to Supabase Storage
async function uploadFileToStorage(file, workspaceId, userId) {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const extension = file.filename.split('.').pop();
    const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `drafts/${workspaceId}/${userId}/${timestamp}-${randomStr}-${sanitizedFilename}`;

    console.log(`[uploadFileToStorage] Uploading: ${storagePath}, size: ${file.buffer.length} bytes`);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('post-media')
      .upload(storagePath, file.buffer, {
        contentType: file.mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error(`[uploadFileToStorage] Error:`, error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('post-media')
      .getPublicUrl(storagePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: storagePath
    };
  } catch (error) {
    console.error(`[uploadFileToStorage] Exception:`, error);
    return { success: false, error: error.message };
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse form data with files
    const { fields, files } = await parseFormData(req);

    const { workspaceId, userId } = fields;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: "workspaceId and userId are required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    console.log(`[upload-media] Uploading ${files.length} files for workspace ${workspaceId}`);

    // Upload all files in parallel
    const uploadPromises = files.map(file => uploadFileToStorage(file, workspaceId, userId));
    const results = await Promise.all(uploadPromises);

    // Check for errors
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      return res.status(500).json({
        error: "Failed to upload some files",
        details: failures.map(f => f.error)
      });
    }

    // Return public URLs
    const urls = results.map(r => r.url);
    return res.status(200).json({ urls });

  } catch (error) {
    console.error("Error in upload-media:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
