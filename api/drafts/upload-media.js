const { createClient } = require("@supabase/supabase-js");
const Busboy = require("busboy");

// ✅ CRITICAL FIX: Disable Vercel's default body parser so busboy can stream the raw request.
// Without this, Vercel consumes the body before busboy sees it, causing all uploads to fail.
module.exports.config = {
  api: {
    bodyParser: false,
    sizeLimit: "50mb",
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse FormData using busboy
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
        files: 10,                   // max 10 files (Instagram carousel limit)
      },
    });
    let filesPending = 0;
    let busboyFinished = false;

    const checkComplete = () => {
      if (busboyFinished && filesPending === 0) {
        resolve({ fields, files });
      }
    };

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (fieldname, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      filesPending++;

      file.on("data", (data) => {
        chunks.push(data);
      });

      file.on("end", () => {
        files.push({
          buffer: Buffer.concat(chunks),
          filename,
          encoding,
          mimeType,
        });
        filesPending--;
        checkComplete();
      });

      file.on("error", (err) => {
        filesPending--;
        reject(err);
      });
    });

    busboy.on("finish", () => {
      busboyFinished = true;
      checkComplete();
    });

    busboy.on("error", reject);

    req.pipe(busboy);
  });
}

// Upload single file to Supabase Storage
async function uploadFileToStorage(file, workspaceId, userId) {
  try {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    // ✅ Path must start with userId to satisfy RLS policy:
    // auth.uid()::text = storage.foldername(name)[1]
    const storagePath = `${userId}/drafts/${workspaceId}/${timestamp}-${randomStr}-${sanitizedFilename}`;

    console.log(
      `[uploadFileToStorage] Uploading: ${storagePath}, size: ${file.buffer.length} bytes`
    );

    const { data, error } = await supabase.storage
      .from("post-media")
      .upload(storagePath, file.buffer, {
        contentType: file.mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error(`[uploadFileToStorage] Error:`, error);
      return { success: false, error: error.message };
    }

    const { data: urlData } = supabase.storage
      .from("post-media")
      .getPublicUrl(storagePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: storagePath,
    };
  } catch (error) {
    console.error(`[uploadFileToStorage] Exception:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = async function handler(req, res) {
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
    const { fields, files } = await parseFormData(req);
    const { workspaceId, userId } = fields;

    if (!workspaceId || !userId) {
      return res
        .status(400)
        .json({ error: "workspaceId and userId are required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    console.log(
      `[upload-media] Uploading ${files.length} files for workspace ${workspaceId}`
    );

    const uploadPromises = files.map((file) =>
      uploadFileToStorage(file, workspaceId, userId)
    );
    const results = await Promise.all(uploadPromises);

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      return res.status(500).json({
        error: "Failed to upload some files",
        details: failures.map((f) => f.error),
      });
    }

    const urls = results.map((r) => r.url);
    return res.status(200).json({ urls });
  } catch (error) {
    console.error("Error in upload-media:", error);
    return res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};
