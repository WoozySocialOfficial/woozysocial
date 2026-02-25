const {
  setCors,
  getSupabase,
  sendSuccess,
  sendError,
  ErrorCodes,
  logError
} = require("./_utils");
const { sendDailySummaryAlert, getAdminEmails } = require("./_adminAlerts");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET (cron) and POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return sendError(res, "Method not allowed", ErrorCodes.METHOD_NOT_ALLOWED);
  }

  const supabase = getSupabase();
  if (!supabase) {
    return sendError(res, "Database service unavailable", ErrorCodes.CONFIG_ERROR);
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    return sendSuccess(res, { message: "No ADMIN_ALERT_EMAILS configured, skipping daily summary" });
  }

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Posts sent in the last 24 hours
    const { data: postedPosts, error: postedErr } = await supabase
      .from('posts')
      .select('id, caption, platforms, posted_at, workspace_id')
      .eq('status', 'posted')
      .gte('posted_at', twentyFourHoursAgo)
      .order('posted_at', { ascending: false });

    if (postedErr) logError('daily-summary.posted', postedErr);

    // Posts that failed in the last 24 hours
    const { data: failedPosts, error: failedErr } = await supabase
      .from('posts')
      .select('id, caption, platforms, last_error, posted_at, workspace_id')
      .eq('status', 'failed')
      .gte('posted_at', twentyFourHoursAgo)
      .order('posted_at', { ascending: false });

    if (failedErr) logError('daily-summary.failed', failedErr);

    // Posts scheduled for the next 24 hours
    const { data: scheduledPosts, error: scheduledErr } = await supabase
      .from('posts')
      .select('id, caption, platforms, scheduled_at, workspace_id')
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', twentyFourHoursAhead)
      .order('scheduled_at', { ascending: true });

    if (scheduledErr) logError('daily-summary.scheduled', scheduledErr);

    const posted = (postedPosts || []).length;
    const failed = (failedPosts || []).length;
    const scheduled = (scheduledPosts || []).length;

    const failedDetails = (failedPosts || []).map(p => ({
      caption: p.caption ? p.caption.substring(0, 60) + (p.caption.length > 60 ? '...' : '') : '(no caption)',
      platforms: p.platforms || [],
      error: p.last_error ? p.last_error.substring(0, 120) : 'Unknown'
    }));

    // Send the summary email
    const result = await sendDailySummaryAlert({
      posted,
      failed,
      scheduled,
      failedDetails
    });

    console.log(`[DailySummary] Sent: ${posted} posted, ${failed} failed, ${scheduled} upcoming`);

    return sendSuccess(res, {
      message: "Daily summary sent",
      stats: { posted, failed, scheduled },
      emailSent: result.success
    });

  } catch (error) {
    logError('daily-summary.handler', error);
    return sendError(res, "Failed to generate daily summary", ErrorCodes.INTERNAL_ERROR);
  }
};

module.exports.config = {
  maxDuration: 30
};
