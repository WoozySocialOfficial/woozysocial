import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Splits text into segments, wrapping URLs in styled spans.
 * Returns an array of React elements for rendering in previews.
 */
export function linkifyText(text) {
  if (!text) return text;

  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    URL_REGEX.test(part) ? (
      <span key={i} className="preview-link">{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}
