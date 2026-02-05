import React from 'react';
import {
  FaInstagram,
  FaFacebookF,
  FaLinkedinIn,
  FaYoutube,
  FaTiktok,
  FaPinterest,
  FaHome,
  FaSearch,
  FaPlus,
  FaUser,
  FaHeart,
  FaComment,
  FaShare,
  FaBookmark,
  FaEllipsisH,
  FaBell,
  FaEnvelope,
  FaBars
} from 'react-icons/fa';
import { FaXTwitter, FaBluesky } from 'react-icons/fa6';
import { SiThreads } from 'react-icons/si';
import {
  AiOutlineHeart,
  AiFillHeart,
  AiOutlineComment,
  AiOutlineSend,
  AiOutlineMore,
  AiOutlineRetweet
} from 'react-icons/ai';
import {
  BsBookmark,
  BsBookmarkFill,
  BsThreeDots,
  BsPlayCircle
} from 'react-icons/bs';
import { MdVerified, MdOutlineVerified } from 'react-icons/md';
import { IoMdVideocam } from 'react-icons/io';
import { BiRepost } from 'react-icons/bi';

// Status Bar Icons
export const StatusBarIcons = {
  Cellular: () => (
    <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
      <rect width="2" height="4" x="0" y="8" rx="0.5" />
      <rect width="2" height="6" x="4" y="6" rx="0.5" />
      <rect width="2" height="8" x="8" y="4" rx="0.5" />
      <rect width="2" height="10" x="12" y="2" rx="0.5" />
      <rect width="2" height="12" x="16" y="0" rx="0.5" />
    </svg>
  ),
  Wifi: () => (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
      <path d="M8 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      <path d="M8 6.5c1.38 0 2.63.56 3.54 1.46l.7-.7A5.97 5.97 0 0 0 8 5a5.97 5.97 0 0 0-4.24 1.76l.7.7A4.97 4.97 0 0 1 8 6.5Z" />
      <path d="M2.1 4.9A8.96 8.96 0 0 1 8 2a8.96 8.96 0 0 1 5.9 2.9l.7-.7A9.96 9.96 0 0 0 8 1a9.96 9.96 0 0 0-6.6 3.2l.7.7Z" />
    </svg>
  ),
  Battery: ({ percentage = 80 }) => (
    <svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor">
      <rect x="0" y="1" width="22" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="2" y="3" width={`${(18 * percentage) / 100}`} height="6" rx="1" fill="currentColor" />
      <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" />
    </svg>
  )
};

// Platform Brand Icons
export const PlatformBrandIcons = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  twitter: FaXTwitter,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  threads: SiThreads,
  pinterest: FaPinterest,
  bluesky: FaBluesky,
};

// Navigation Icons
export const NavIcons = {
  Home: FaHome,
  Search: FaSearch,
  Plus: FaPlus,
  User: FaUser,
  Bell: FaBell,
  Envelope: FaEnvelope,
  Bars: FaBars,
  Reels: IoMdVideocam
};

// Action Icons
export const ActionIcons = {
  Heart: AiOutlineHeart,
  HeartFilled: AiFillHeart,
  Comment: AiOutlineComment,
  Send: AiOutlineSend,
  Share: FaShare,
  Bookmark: BsBookmark,
  BookmarkFilled: BsBookmarkFill,
  More: AiOutlineMore,
  ThreeDots: BsThreeDots,
  Retweet: AiOutlineRetweet,
  Repost: BiRepost,
  Play: BsPlayCircle
};

// Badge Icons
export const BadgeIcons = {
  Verified: MdVerified,
  VerifiedOutline: MdOutlineVerified
};

// Helper component to get platform icon
export const getPlatformIcon = (platform, props = {}) => {
  const IconComponent = PlatformBrandIcons[platform];
  return IconComponent ? <IconComponent {...props} /> : null;
};

// Helper component for verified badge
export const VerifiedBadge = ({ filled = true, className = '', color = '#0095F6' }) => {
  const Icon = filled ? BadgeIcons.Verified : BadgeIcons.VerifiedOutline;
  return <Icon className={className} style={{ color }} />;
};

export default {
  StatusBarIcons,
  PlatformBrandIcons,
  NavIcons,
  ActionIcons,
  BadgeIcons,
  getPlatformIcon,
  VerifiedBadge
};
