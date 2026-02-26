import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube, FaPinterest, FaGoogle } from "react-icons/fa";
import { FaTiktok, FaThreads, FaBluesky } from "react-icons/fa6";
import { SiX } from "react-icons/si";

/**
 * SocialNetworkSelector - Grid of social networks to post to
 */

const SOCIAL_NETWORKS = [
  { name: "threads", displayName: "Threads", icon: FaThreads, color: "#000000" },
  { name: "twitter", displayName: "Twitter/X", icon: SiX, color: "#000000" },
  { name: "googleBusiness", displayName: "Google", icon: FaGoogle, color: "#4285F4" },
  { name: "pinterest", displayName: "Pinterest", icon: FaPinterest, color: "#BD081C" },
  { name: "tiktok", displayName: "TikTok", icon: FaTiktok, color: "#000000" },
  { name: "instagram", displayName: "Instagram", icon: FaInstagram, color: "#E4405F" },
  { name: "bluesky", displayName: "BlueSky", icon: FaBluesky, color: "#1185FE" },
  { name: "youtube", displayName: "Youtube", icon: FaYoutube, color: "#FF0000" },
  { name: "linkedin", displayName: "LinkedIn", icon: FaLinkedinIn, color: "#0A66C2" },
  { name: "facebook", displayName: "Facebook", icon: FaFacebookF, color: "#1877F2" }
];

export const SocialNetworkSelector = ({
  selectedNetworks,
  onToggle,
  connectedAccounts = []
}) => {
  // Check if a platform is linked (connected)
  const isLinked = (platformName) => {
    const normalizedName = platformName.toLowerCase();

    // Map internal names to Ayrshare platform names
    const platformMapping = {
      twitter: ['twitter', 'x'],
      googlebusiness: ['googlebusiness', 'google', 'gmb'],
      googleBusiness: ['googlebusiness', 'google', 'gmb']
    };

    const namesToCheck = platformMapping[normalizedName] || [normalizedName];

    return connectedAccounts.some(account => {
      const normalizedAccount = account.toLowerCase();
      return namesToCheck.some(name => normalizedAccount === name || normalizedAccount.includes(name));
    });
  };

  // Build network list with linked status
  const networks = SOCIAL_NETWORKS.map(network => ({
    ...network,
    linked: isLinked(network.name)
  }));

  return (
    <div className="compose-socials">
      <h3 className="socials-title">Socials</h3>
      <div className="socials-grid">
        {networks.map((network) => {
          const Icon = network.icon;
          const isSelected = selectedNetworks[network.name];

          return (
            <button
              key={network.name}
              className={`social-button ${isSelected ? "selected" : ""} ${!network.linked ? "disabled" : ""}`}
              style={{
                "--network-color": network.color,
                borderColor: isSelected ? network.color : undefined,
                backgroundColor: isSelected ? `${network.color}15` : undefined
              }}
              onClick={() => onToggle(network.name, network.linked)}
              disabled={!network.linked}
              title={network.linked ? network.displayName : `Connect ${network.displayName} to post`}
            >
              <Icon
                size={24}
                color={isSelected ? network.color : network.linked ? "#555" : "#ccc"}
              />
              {isSelected && <span className="check-mark">✓</span>}
              {!network.linked && <span className="lock-icon">🔒</span>}
            </button>
          );
        })}
      </div>
      <p className="socials-hint">
        {connectedAccounts.length === 0
          ? "Connect your social accounts from the Dashboard to start posting"
          : "Click to select platforms for your post"}
      </p>
    </div>
  );
};

export default SocialNetworkSelector;
