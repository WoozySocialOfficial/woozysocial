const { Resend } = require('resend');

const FROM_EMAIL = 'Woozy Social Alerts <hello@woozysocials.com>';

/**
 * Get admin email recipients from environment variable
 * @returns {string[]} Array of email addresses
 */
function getAdminEmails() {
  const emails = process.env.ADMIN_ALERT_EMAILS;
  if (!emails) return [];
  return emails.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Send an email alert to all admin recipients
 * @param {Object} params
 * @param {string} params.subject - Email subject
 * @param {string} params.html - Email HTML body
 * @returns {Promise<{success: boolean, sent: number}>}
 */
async function sendAdminAlert({ subject, html }) {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    console.warn('[AdminAlert] No ADMIN_ALERT_EMAILS configured, skipping');
    return { success: false, sent: 0 };
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[AdminAlert] RESEND_API_KEY not configured, skipping');
    return { success: false, sent: 0 };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject,
      html
    });
    console.log(`[AdminAlert] Sent "${subject}" to ${recipients.length} recipient(s)`);
    return { success: true, sent: recipients.length };
  } catch (error) {
    console.error('[AdminAlert] Failed to send email:', error.message);
    return { success: false, sent: 0 };
  }
}

/**
 * Alert: A post is being published (going out to social platforms)
 */
async function sendPostGoingOutAlert({ postId, workspaceName, platforms, caption, scheduledAt }) {
  const platformList = (platforms || []).join(', ');
  const preview = caption ? caption.substring(0, 100) + (caption.length > 100 ? '...' : '') : '(no caption)';
  const time = scheduledAt ? new Date(scheduledAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : 'Now';

  return sendAdminAlert({
    subject: `✅ Post Going Out → ${platformList}`,
    html: emailTemplate({
      title: 'Post Going Out',
      color: '#38A169',
      rows: [
        ['Platforms', platformList],
        ['Workspace', workspaceName || 'Unknown'],
        ['Scheduled', time],
        ['Caption', `<em>${preview}</em>`],
        ['Post ID', `<code>${postId}</code>`]
      ]
    })
  });
}

/**
 * Alert: A post failed to publish
 */
async function sendPostFailedAdminAlert({ postId, workspaceName, platforms, errorMessage }) {
  const platformList = (platforms || []).join(', ');

  return sendAdminAlert({
    subject: `❌ Post Failed → ${platformList}`,
    html: emailTemplate({
      title: 'Post Failed to Publish',
      color: '#E53E3E',
      rows: [
        ['Platforms', platformList],
        ['Workspace', workspaceName || 'Unknown'],
        ['Error', `<strong>${errorMessage || 'Unknown error'}</strong>`],
        ['Post ID', `<code>${postId}</code>`],
        ['Time', new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })]
      ]
    })
  });
}

/**
 * Alert: Scheduler encountered an unexpected error
 */
async function sendSchedulerErrorAlert({ error, context }) {
  return sendAdminAlert({
    subject: '🚨 Scheduler Error — Needs Attention',
    html: emailTemplate({
      title: 'Scheduler Error',
      color: '#DD6B20',
      rows: [
        ['Context', context || 'scheduler.handler'],
        ['Error', `<strong>${error?.message || error || 'Unknown'}</strong>`],
        ['Time', new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })]
      ]
    })
  });
}

/**
 * Daily summary email with stats
 */
async function sendDailySummaryAlert({ posted, failed, scheduled, failedDetails }) {
  const failedRows = (failedDetails || []).map(f =>
    `<tr><td style="padding:4px 8px;border:1px solid #eee;">${f.caption || '(no caption)'}</td>` +
    `<td style="padding:4px 8px;border:1px solid #eee;">${(f.platforms || []).join(', ')}</td>` +
    `<td style="padding:4px 8px;border:1px solid #eee;color:#E53E3E;">${f.error || 'Unknown'}</td></tr>`
  ).join('');

  const failedTable = failedDetails && failedDetails.length > 0
    ? `<h3 style="color:#E53E3E;margin-top:20px;">Failed Posts</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px;">
         <tr style="background:#f7f7f7;"><th style="padding:6px 8px;border:1px solid #eee;text-align:left;">Caption</th><th style="padding:6px 8px;border:1px solid #eee;text-align:left;">Platforms</th><th style="padding:6px 8px;border:1px solid #eee;text-align:left;">Error</th></tr>
         ${failedRows}
       </table>`
    : '';

  return sendAdminAlert({
    subject: `📊 Daily Summary — ${posted} sent, ${failed} failed, ${scheduled} upcoming`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#7C3AED,#A855F7);padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:22px;">📊 Woozy Social — Daily Summary</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">${new Date().toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <div style="display:flex;gap:16px;text-align:center;margin-bottom:20px;">
            <div style="flex:1;padding:16px;background:#F0FFF4;border-radius:8px;">
              <div style="font-size:28px;font-weight:700;color:#38A169;">${posted}</div>
              <div style="font-size:12px;color:#68D391;">Posts Sent</div>
            </div>
            <div style="flex:1;padding:16px;background:#FFF5F5;border-radius:8px;">
              <div style="font-size:28px;font-weight:700;color:#E53E3E;">${failed}</div>
              <div style="font-size:12px;color:#FC8181;">Failed</div>
            </div>
            <div style="flex:1;padding:16px;background:#EBF8FF;border-radius:8px;">
              <div style="font-size:28px;font-weight:700;color:#3182CE;">${scheduled}</div>
              <div style="font-size:12px;color:#63B3ED;">Upcoming</div>
            </div>
          </div>
          ${failedTable}
          <p style="color:#A0AEC0;font-size:11px;margin-top:24px;text-align:center;">Woozy Social Alert System • ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>
        </div>
      </div>
    `
  });
}

/**
 * Reusable email HTML template
 */
function emailTemplate({ title, color, rows }) {
  const rowsHtml = rows.map(([label, value]) =>
    `<tr><td style="padding:8px 12px;font-weight:600;color:#4A5568;width:120px;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:#2D3748;">${value}</td></tr>`
  ).join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${color};padding:16px 24px;border-radius:12px 12px 0 0;">
        <h2 style="color:white;margin:0;font-size:18px;">${title}</h2>
      </div>
      <div style="background:white;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;">${rowsHtml}</table>
        <p style="color:#A0AEC0;font-size:11px;margin-top:16px;text-align:center;">Woozy Social Alert System</p>
      </div>
    </div>
  `;
}

module.exports = {
  sendAdminAlert,
  sendPostGoingOutAlert,
  sendPostFailedAdminAlert,
  sendSchedulerErrorAlert,
  sendDailySummaryAlert,
  getAdminEmails
};
