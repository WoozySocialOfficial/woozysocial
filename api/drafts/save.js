import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const {
      workspaceId,
      userId,
      draftId,
      caption,
      mediaUrls,
      platforms,
      scheduledDate
    } = req.body;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: "workspaceId and userId are required" });
    }

    const draftData = {
      workspace_id: workspaceId,
      user_id: userId,
      caption: caption || "",
      media_urls: mediaUrls || [],
      platforms: platforms || [],
      scheduled_date: scheduledDate || null,
      updated_at: new Date().toISOString()
    };

    let result;

    if (draftId) {
      // UPDATE existing draft
      const { data, error } = await supabase
        .from("post_drafts")
        .update(draftData)
        .eq("id", draftId)
        .eq("workspace_id", workspaceId)
        .select();

      // If update fails or returns no rows (draft was deleted), create new draft
      if (error && error.code !== 'PGRST116') {
        console.error("Error updating draft:", error);
        return res.status(500).json({ error: "Failed to update draft" });
      }

      if (!data || data.length === 0) {
        // Draft doesn't exist, create a new one instead
        console.log("Draft not found, creating new draft instead");
        const { data: newData, error: createError } = await supabase
          .from("post_drafts")
          .insert([draftData])
          .select()
          .single();

        if (createError) {
          console.error("Error creating draft:", createError);
          return res.status(500).json({ error: "Failed to create draft" });
        }
        result = newData;
      } else {
        result = data[0];
      }
    } else {
      // CREATE new draft
      const { data, error } = await supabase
        .from("post_drafts")
        .insert([draftData])
        .select()
        .single();

      if (error) {
        console.error("Error creating draft:", error);
        return res.status(500).json({ error: "Failed to create draft" });
      }
      result = data;
    }

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Error in drafts/save:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
