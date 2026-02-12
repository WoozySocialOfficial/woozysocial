import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Inject early preconnect hint for Supabase so browser starts TLS handshake sooner
if (typeof document !== 'undefined' && !document.querySelector(`link[href="${supabaseUrl}"]`)) {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = supabaseUrl;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/**
 * Upload a file directly to Supabase storage from the frontend
 * Bypasses Vercel's 4.5MB limit for large files like videos
 * @param {File} file - The file to upload
 * @param {string} userId - User ID for folder organization
 * @param {string} workspaceId - Workspace ID for folder organization
 * @param {function} onProgress - Optional callback for upload progress (0-100)
 * @returns {Promise<{success: boolean, publicUrl?: string, error?: string}>}
 */
export async function uploadMediaDirect(file, userId, workspaceId, onProgress) {
  try {
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${workspaceId || userId}/${timestamp}-${sanitizedFilename}`;

    // Upload to Supabase Storage bucket 'post-media'
    const { data, error } = await supabase.storage
      .from('post-media')
      .upload(storagePath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('[uploadMediaDirect] Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('post-media')
      .getPublicUrl(storagePath);

    if (!publicUrlData || !publicUrlData.publicUrl) {
      return { success: false, error: 'Failed to generate public URL' };
    }

    console.log('[uploadMediaDirect] Success:', publicUrlData.publicUrl);
    return { success: true, publicUrl: publicUrlData.publicUrl };
  } catch (error) {
    console.error('[uploadMediaDirect] Error:', error);
    return { success: false, error: error.message };
  }
}
