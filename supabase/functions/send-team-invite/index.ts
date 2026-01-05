import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
  email: string;
  role: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message || 'No user found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const userId = user.id;
    const userEmail = user.email || '';

    console.log('Authenticated user:', userId, userEmail);

    // Now create admin client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse request body
    const { email, role }: InviteRequest = await req.json();

    // Validate input
    if (!email || !role) {
      return new Response(
        JSON.stringify({ error: 'Email and role are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate role
    const validRoles = ['admin', 'editor', 'view_only'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role. Must be admin, editor, or view_only' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if user is trying to invite themselves
    if (email.toLowerCase() === userEmail?.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'You cannot invite yourself' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if email is already a team member
    const { data: existingMember } = await supabaseAdmin
      .from('team_members')
      .select('id')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: 'This user is already a team member' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if there's already a pending invitation
    const { data: existingInvite } = await supabaseAdmin
      .from('team_invitations')
      .select('id, status')
      .eq('owner_id', userId)
      .eq('email', email.toLowerCase())
      .single();

    if (existingInvite && existingInvite.status === 'pending') {
      return new Response(
        JSON.stringify({ error: 'An invitation has already been sent to this email' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Create the invitation
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('team_invitations')
      .insert({
        owner_id: userId,
        email: email.toLowerCase(),
        role: role,
        status: 'pending',
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invitation:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Failed to create invitation' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Get inviter's name/email for the email
    const inviterName = userEmail || 'A team member';

    // Generate the invitation link
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const inviteLink = `${appUrl}/accept-invite?token=${invitation.invite_token}`;

    // Send invitation email
    // NOTE: You'll need to configure Resend API key in Supabase dashboard
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (RESEND_API_KEY) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F1F6F4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 16px; border: 2px solid rgba(0, 0, 0, 0.4); box-shadow: 0 4px 12px rgba(17, 76, 90, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px; text-align: center; background-color: #114C5A; border-radius: 14px 14px 0 0;">
              <h1 style="margin: 0; color: #FFC801; font-size: 28px; font-weight: 700;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                Hi there,
              </p>

              <p style="margin: 0 0 20px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join their team as a <strong>${getRoleLabel(role)}</strong>.
              </p>

              <div style="background-color: #F1F6F4; border: 2px solid rgba(0, 0, 0, 0.1); border-radius: 10px; padding: 20px; margin: 30px 0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #114C5A;">Your Role:</p>
                <p style="margin: 0; font-size: 14px; color: #114C5A; opacity: 0.8;">${getRoleDescription(role)}</p>
              </div>

              <p style="margin: 0 0 30px 0; font-size: 16px; color: #114C5A; line-height: 1.6;">
                Click the button below to accept this invitation and get started:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="margin: 0 auto;">
                <tr>
                  <td style="border-radius: 10px; background-color: #FFC801;">
                    <a href="${inviteLink}" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #114C5A; text-decoration: none; border-radius: 10px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; font-size: 14px; color: #114C5A; opacity: 0.7; line-height: 1.6;">
                This invitation will expire in <strong>7 days</strong>. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background-color: #F1F6F4; border-radius: 0 0 14px 14px; border-top: 2px solid rgba(0, 0, 0, 0.1);">
              <p style="margin: 0; font-size: 12px; color: #114C5A; opacity: 0.6;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteLink}" style="color: #114C5A; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim();

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'onboarding@resend.dev', // Use Resend's test email or your verified domain
            to: [email],
            subject: `${inviterName} invited you to join their team`,
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.text();
          console.error('Error sending email:', errorData);
          // Don't fail the whole request if email fails
        }
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Don't fail the whole request if email fails
      }
    } else {
      console.warn('RESEND_API_KEY not configured - invitation created but email not sent');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invitation sent successfully',
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          invited_at: invitation.invited_at,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Helper functions
function getRoleLabel(role: string): string {
  const labels: { [key: string]: string } = {
    admin: 'Admin',
    editor: 'Editor',
    view_only: 'View Only',
  };
  return labels[role] || role;
}

function getRoleDescription(role: string): string {
  const descriptions: { [key: string]: string } = {
    admin: 'Full access - can invite, remove members, and manage all posts',
    editor: 'Can create, edit, and delete posts',
    view_only: 'Read-only access - can view posts and team members',
  };
  return descriptions[role] || '';
}
