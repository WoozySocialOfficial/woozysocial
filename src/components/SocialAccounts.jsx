import React, { useEffect, useState, useCallback } from "react";
import {
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaYoutube,
  FaReddit,
  FaTelegram,
  FaPinterest,
  FaSnapchat
} from "react-icons/fa";
import { FaTiktok } from "react-icons/fa6";
import { SiX, SiBluesky } from "react-icons/si";
import { baseURL } from "../utils/constants";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { useWorkspace } from "../contexts/WorkspaceContext";
import "./SocialAccounts.css";

const PLATFORMS = [
  { name: "BlueSky", icon: SiBluesky, color: "#1185FE" },
  { name: "Facebook", icon: FaFacebookF, color: "#1877F2" },
  { name: "Google Business", icon: null, color: "#4285F4" },
  { name: "Instagram", icon: FaInstagram, color: "#E4405F" },
  { name: "LinkedIn", icon: FaLinkedinIn, color: "#0A66C2" },
  { name: "Pinterest", icon: FaPinterest, color: "#BD081C" },
  { name: "Reddit", icon: FaReddit, color: "#FF4500" },
  { name: "Snapchat", icon: FaSnapchat, color: "#FFFC00" },
  { name: "Telegram", icon: FaTelegram, color: "#0088cc" },
  { name: "TikTok", icon: FaTiktok, color: "#000000" },
  { name: "Youtube", icon: FaYoutube, color: "#FF0000" },
  { name: "X/Twitter", icon: SiX, color: "#000000" }
];

export const SocialAccounts = () => {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [activeAccounts, setActiveAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchActiveAccounts = useCallback(async () => {
    if (!user || !activeWorkspace) return;

    try {
      // Use workspaceId for multi-workspace support
      const res = await fetch(`${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      const accounts = data.activeSocialAccounts || [];
      setActiveAccounts(accounts);

      // Sync with Supabase database
      await syncAccountsToDatabase(accounts);
    } catch (err) {
      console.warn("fetchActiveAccounts error", err);
    }
  }, [user, activeWorkspace]);

  const syncAccountsToDatabase = async (accounts) => {
    if (!user || !accounts.length) return;

    try {
      // Get existing connected accounts from database
      const { data: existingAccounts } = await supabase
        .from('connected_accounts')
        .select('platform, platform_user_id')
        .eq('user_id', user.id);

      const existingSet = new Set(
        (existingAccounts || []).map(a => `${a.platform}_${a.platform_user_id}`)
      );

      // Insert new accounts that don't exist yet
      const newAccounts = accounts
        .filter(account => {
          const key = `${account.name}_${account.platformUserId || ''}`;
          return !existingSet.has(key);
        })
        .map(account => ({
          user_id: user.id,
          platform: account.name,
          platform_user_id: account.platformUserId || null,
          platform_username: account.username || null,
          is_active: true,
        }));

      if (newAccounts.length > 0) {
        await supabase
          .from('connected_accounts')
          .upsert(newAccounts, {
            onConflict: 'user_id,platform,platform_user_id'
          });
      }
    } catch (err) {
      console.error('Error syncing accounts to database:', err);
    }
  };

  useEffect(() => {
    fetchActiveAccounts();
  }, [fetchActiveAccounts]);

  // Listen for social accounts updates from other components
  useEffect(() => {
    const handleAccountsUpdated = () => {
      fetchActiveAccounts();
    };
    window.addEventListener('socialAccountsUpdated', handleAccountsUpdated);
    return () => window.removeEventListener('socialAccountsUpdated', handleAccountsUpdated);
  }, [fetchActiveAccounts]);

  const handleLink = async () => {
    if (!user || !activeWorkspace) return;

    try {
      setLoading(true);
      const r = await fetch(`${baseURL}/api/generate-jwt?userId=${user.id}&workspaceId=${activeWorkspace.id}`);
      if (!r.ok) throw new Error("Failed to generate link");
      const d = await r.json();
      const width = 900;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        d.url,
        "AyrshareLink",
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes`
      );

      const start = Date.now();
      const timeoutMs = 60_000; // 60s
      const pollInterval = 2000;
      const initialLen = activeAccounts.length;

      const poll = setInterval(async () => {
        if (popup && popup.closed) {
          clearInterval(poll);
          await fetchActiveAccounts();
          setLoading(false);
          // Notify other components
          window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
          return;
        }

        try {
          const rr = await fetch(`${baseURL}/api/user-accounts?workspaceId=${activeWorkspace.id}`);
          if (rr.ok) {
            const dd = await rr.json();
            const accounts = dd.activeSocialAccounts || dd.accounts || [];
            if (Array.isArray(accounts)) {
              if (accounts.length !== initialLen) {
                setActiveAccounts(accounts);
                clearInterval(poll);
                if (popup && !popup.closed) popup.close();
                setLoading(false);
                window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
              }
            }
          }
        } catch (err) {
          console.warn("poll error", err);
        }

        if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          await fetchActiveAccounts();
          if (popup && !popup.closed) popup.close();
          setLoading(false);
          window.dispatchEvent(new CustomEvent('socialAccountsUpdated'));
        }
      }, pollInterval);
    } catch (err) {
      console.error("link error", err);
      setLoading(false);
    }
  };

  const isLinked = (platName) => {
    // Handle both string array ['instagram', 'facebook'] and object array [{name: 'instagram'}]
    return activeAccounts.some((a) => {
      const accountName = typeof a === 'string' ? a : a.name;
      if (!accountName) return false;
      // Normalize names for comparison
      const normalizedAccount = accountName.toLowerCase().replace(/[^a-z]/g, '');
      const normalizedPlatform = platName.toLowerCase().replace(/[^a-z]/g, '');
      return normalizedAccount === normalizedPlatform ||
             normalizedAccount.includes(normalizedPlatform) ||
             normalizedPlatform.includes(normalizedAccount);
    });
  };

  return (
    <div className="social-accounts-container">
      <div className="social-accounts-header">
        <h1 className="social-accounts-title">Social Accounts</h1>
        <p className="social-accounts-subtitle">Click an icon to link to a social network</p>
      </div>

      <div className="social-accounts-grid">
        {PLATFORMS.map((platform) => {
          const Icon = platform.icon;
          const linked = isLinked(platform.name);

          return (
            <div
              key={platform.name}
              className="platform-card"
              onClick={!linked ? handleLink : undefined}
              style={{ cursor: !linked ? "pointer" : "default" }}
            >
              <div className="platform-info">
                <div
                  className="platform-icon"
                  style={{ backgroundColor: platform.color }}
                >
                  {Icon && <Icon color="#ffffff" size={24} />}
                  {!Icon && <span style={{ color: "#ffffff", fontSize: "12px", fontWeight: "600" }}>GB</span>}
                </div>
                <div className="platform-details">
                  <div className="platform-name">{platform.name}</div>
                  <div className="platform-status">
                    {linked ? "Connected" : "Click to link"}
                  </div>
                </div>
              </div>

              <div className="platform-badge">
                {linked ? (
                  <span className="badge-active">ACTIVE</span>
                ) : (
                  <span className="badge-inactive">INACTIVE</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Connecting...</div>
        </div>
      )}
    </div>
  );
};

export default SocialAccounts;
