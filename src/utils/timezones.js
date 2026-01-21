// Comprehensive list of timezones grouped by region
export const TIMEZONES = [
  // UTC
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: '+00:00' },

  // Africa
  { value: 'Africa/Johannesburg', label: 'South Africa (Johannesburg)', offset: '+02:00' },
  { value: 'Africa/Cairo', label: 'Egypt (Cairo)', offset: '+02:00' },
  { value: 'Africa/Lagos', label: 'Nigeria (Lagos)', offset: '+01:00' },
  { value: 'Africa/Nairobi', label: 'Kenya (Nairobi)', offset: '+03:00' },
  { value: 'Africa/Casablanca', label: 'Morocco (Casablanca)', offset: '+01:00' },

  // Europe
  { value: 'Europe/London', label: 'United Kingdom (London)', offset: '+00:00' },
  { value: 'Europe/Dublin', label: 'Ireland (Dublin)', offset: '+00:00' },
  { value: 'Europe/Paris', label: 'France (Paris)', offset: '+01:00' },
  { value: 'Europe/Berlin', label: 'Germany (Berlin)', offset: '+01:00' },
  { value: 'Europe/Rome', label: 'Italy (Rome)', offset: '+01:00' },
  { value: 'Europe/Madrid', label: 'Spain (Madrid)', offset: '+01:00' },
  { value: 'Europe/Amsterdam', label: 'Netherlands (Amsterdam)', offset: '+01:00' },
  { value: 'Europe/Brussels', label: 'Belgium (Brussels)', offset: '+01:00' },
  { value: 'Europe/Zurich', label: 'Switzerland (Zurich)', offset: '+01:00' },
  { value: 'Europe/Vienna', label: 'Austria (Vienna)', offset: '+01:00' },
  { value: 'Europe/Warsaw', label: 'Poland (Warsaw)', offset: '+01:00' },
  { value: 'Europe/Athens', label: 'Greece (Athens)', offset: '+02:00' },
  { value: 'Europe/Moscow', label: 'Russia (Moscow)', offset: '+03:00' },

  // Americas
  { value: 'America/New_York', label: 'US Eastern (New York)', offset: '-05:00' },
  { value: 'America/Chicago', label: 'US Central (Chicago)', offset: '-06:00' },
  { value: 'America/Denver', label: 'US Mountain (Denver)', offset: '-07:00' },
  { value: 'America/Los_Angeles', label: 'US Pacific (Los Angeles)', offset: '-08:00' },
  { value: 'America/Phoenix', label: 'US Arizona (Phoenix)', offset: '-07:00' },
  { value: 'America/Toronto', label: 'Canada (Toronto)', offset: '-05:00' },
  { value: 'America/Vancouver', label: 'Canada (Vancouver)', offset: '-08:00' },
  { value: 'America/Mexico_City', label: 'Mexico (Mexico City)', offset: '-06:00' },
  { value: 'America/Sao_Paulo', label: 'Brazil (São Paulo)', offset: '-03:00' },
  { value: 'America/Buenos_Aires', label: 'Argentina (Buenos Aires)', offset: '-03:00' },

  // Asia
  { value: 'Asia/Dubai', label: 'UAE (Dubai)', offset: '+04:00' },
  { value: 'Asia/Kolkata', label: 'India (Mumbai/Delhi)', offset: '+05:30' },
  { value: 'Asia/Singapore', label: 'Singapore', offset: '+08:00' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', offset: '+08:00' },
  { value: 'Asia/Shanghai', label: 'China (Shanghai)', offset: '+08:00' },
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)', offset: '+09:00' },
  { value: 'Asia/Seoul', label: 'South Korea (Seoul)', offset: '+09:00' },
  { value: 'Asia/Bangkok', label: 'Thailand (Bangkok)', offset: '+07:00' },
  { value: 'Asia/Jakarta', label: 'Indonesia (Jakarta)', offset: '+07:00' },
  { value: 'Asia/Manila', label: 'Philippines (Manila)', offset: '+08:00' },

  // Pacific
  { value: 'Australia/Sydney', label: 'Australia (Sydney)', offset: '+10:00' },
  { value: 'Australia/Melbourne', label: 'Australia (Melbourne)', offset: '+10:00' },
  { value: 'Australia/Perth', label: 'Australia (Perth)', offset: '+08:00' },
  { value: 'Pacific/Auckland', label: 'New Zealand (Auckland)', offset: '+12:00' },
  { value: 'Pacific/Fiji', label: 'Fiji', offset: '+12:00' },
];

// Group timezones by region for better UX
export const TIMEZONES_BY_REGION = {
  'UTC': [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)', offset: '+00:00' },
  ],
  'Africa': TIMEZONES.filter(tz => tz.value.startsWith('Africa/')),
  'Europe': TIMEZONES.filter(tz => tz.value.startsWith('Europe/')),
  'Americas': TIMEZONES.filter(tz => tz.value.startsWith('America/')),
  'Asia': TIMEZONES.filter(tz => tz.value.startsWith('Asia/')),
  'Pacific': TIMEZONES.filter(tz => tz.value.startsWith('Australia/') || tz.value.startsWith('Pacific/')),
};

// Get user's browser timezone
export const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return 'UTC';
  }
};

// Format timezone for display
export const formatTimezone = (timezone) => {
  const tz = TIMEZONES.find(t => t.value === timezone);
  return tz ? tz.label : timezone;
};

// Format date/time in user's timezone
export const formatDateInTimezone = (date, timezone, options = {}) => {
  if (!date) return '';

  const defaultOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  const formatOptions = { ...defaultOptions, ...options };

  try {
    return new Date(date).toLocaleString('en-US', {
      ...formatOptions,
      timeZone: timezone || 'UTC'
    });
  } catch (error) {
    console.error('Error formatting date in timezone:', error);
    return new Date(date).toLocaleString('en-US', formatOptions);
  }
};

// Convert date to user's timezone for display (returns formatted string)
export const convertToUserTimezone = (date, timezone) => {
  if (!date || !timezone) return date;

  try {
    return formatDateInTimezone(date, timezone);
  } catch (error) {
    console.error('Error converting to user timezone:', error);
    return date;
  }
};

// Get short time format in user's timezone (e.g., "2:30 PM")
export const formatTimeInTimezone = (date, timezone) => {
  if (!date) return '';

  try {
    return new Date(date).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || 'UTC'
    });
  } catch (error) {
    console.error('Error formatting time in timezone:', error);
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }
};

// Get date only in user's timezone
export const formatDateOnlyInTimezone = (date, timezone) => {
  if (!date) return '';

  try {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: timezone || 'UTC'
    });
  } catch (error) {
    console.error('Error formatting date only in timezone:', error);
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
};

// ===========================
// UNIFIED DATE FORMATTERS
// ===========================

/**
 * Format relative time (e.g., "Just now", "5m ago", "2h ago", "3d ago")
 * @param {string|Date} dateStr - Date to format
 * @returns {string} - Relative time string
 */
export const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format short date and time (e.g., "Jan 15, 2:30 PM")
 * @param {string|Date} dateStr - Date to format
 * @param {string} timezone - Optional timezone
 * @returns {string} - Formatted date/time string
 */
export const formatShortDateTime = (dateStr, timezone) => {
  if (!dateStr) return 'N/A';

  try {
    const date = new Date(dateStr);
    const options = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(timezone && { timeZone: timezone })
    };
    return date.toLocaleString('en-US', options);
  } catch {
    return new Date(dateStr).toLocaleString();
  }
};

/**
 * Format full date and time for display (e.g., "Mon, Jan 15 at 2:30 PM")
 * @param {string|Date} dateStr - Date to format
 * @param {string} timezone - Optional timezone
 * @returns {string} - Formatted date/time string
 */
export const formatFullDateTime = (dateStr, timezone) => {
  if (!dateStr) return 'N/A';

  try {
    const date = new Date(dateStr);
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(timezone && { timeZone: timezone })
    };
    return date.toLocaleString('en-US', options);
  } catch {
    return new Date(dateStr).toLocaleString();
  }
};

/**
 * Format date for tables and lists (e.g., "1/15/2024 2:30 PM")
 * @param {string|Date} dateStr - Date to format
 * @returns {string} - Formatted date/time string
 */
export const formatTableDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';

  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'N/A';
  }
};

/**
 * Format schedule date with weekday (e.g., "Wed, Jan 15")
 * @param {string|Date} dateStr - Date to format
 * @param {string} timezone - Optional timezone
 * @returns {string} - Formatted date string
 */
export const formatScheduleDate = (dateStr, timezone) => {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(timezone && { timeZone: timezone })
    };
    return date.toLocaleDateString('en-US', options);
  } catch {
    return new Date(dateStr).toLocaleDateString();
  }
};
