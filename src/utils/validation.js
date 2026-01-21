/**
 * Input Validation Utilities
 * Provides common validation functions for forms
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
export const isValidUrl = (url) => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate required field (not empty after trim)
 * @param {string} value - Value to check
 * @returns {boolean}
 */
export const isRequired = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

/**
 * Validate minimum length
 * @param {string} value - Value to check
 * @param {number} minLength - Minimum length required
 * @returns {boolean}
 */
export const hasMinLength = (value, minLength) => {
  if (!value) return false;
  return value.length >= minLength;
};

/**
 * Validate maximum length
 * @param {string} value - Value to check
 * @param {number} maxLength - Maximum length allowed
 * @returns {boolean}
 */
export const hasMaxLength = (value, maxLength) => {
  if (!value) return true;
  return value.length <= maxLength;
};

/**
 * Validate string contains only alphanumeric and allowed characters
 * @param {string} value - Value to check
 * @param {string} allowedChars - Additional allowed characters (e.g., '-_')
 * @returns {boolean}
 */
export const isAlphanumeric = (value, allowedChars = '') => {
  if (!value) return false;
  const regex = new RegExp(`^[a-zA-Z0-9${allowedChars}]+$`);
  return regex.test(value);
};

/**
 * Sanitize string by removing potentially dangerous characters
 * @param {string} value - Value to sanitize
 * @returns {string}
 */
export const sanitizeString = (value) => {
  if (!value) return '';
  return value
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .trim();
};

/**
 * Validate form fields and return errors object
 * @param {object} values - Form values
 * @param {object} rules - Validation rules
 * @returns {object} - Object with field names as keys and error messages as values
 *
 * Example usage:
 * const errors = validateForm(
 *   { email: 'test', name: '' },
 *   {
 *     email: { required: true, email: true },
 *     name: { required: true, minLength: 2 }
 *   }
 * );
 */
export const validateForm = (values, rules) => {
  const errors = {};

  Object.entries(rules).forEach(([field, fieldRules]) => {
    const value = values[field];

    if (fieldRules.required && !isRequired(value)) {
      errors[field] = fieldRules.requiredMessage || `${field} is required`;
      return;
    }

    if (value && fieldRules.email && !isValidEmail(value)) {
      errors[field] = fieldRules.emailMessage || 'Invalid email format';
      return;
    }

    if (value && fieldRules.url && !isValidUrl(value)) {
      errors[field] = fieldRules.urlMessage || 'Invalid URL format';
      return;
    }

    if (value && fieldRules.minLength && !hasMinLength(value, fieldRules.minLength)) {
      errors[field] = fieldRules.minLengthMessage || `Must be at least ${fieldRules.minLength} characters`;
      return;
    }

    if (value && fieldRules.maxLength && !hasMaxLength(value, fieldRules.maxLength)) {
      errors[field] = fieldRules.maxLengthMessage || `Must be no more than ${fieldRules.maxLength} characters`;
      return;
    }

    if (fieldRules.custom && typeof fieldRules.custom === 'function') {
      const customError = fieldRules.custom(value, values);
      if (customError) {
        errors[field] = customError;
      }
    }
  });

  return errors;
};

/**
 * Check if form has any validation errors
 * @param {object} errors - Errors object from validateForm
 * @returns {boolean}
 */
export const hasErrors = (errors) => {
  return Object.keys(errors).length > 0;
};
