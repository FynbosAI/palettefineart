/**
 * Utility functions for date formatting and manipulation
 */

/**
 * Safely validates and parses a date string
 * Returns null if the date is invalid
 * Handles DD/MM/YYYY, MM/DD/YYYY, and ISO formats
 */
const safeParseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
    return null;
  }
  
  try {
    // Check if the date is in DD/MM/YYYY format
    const ddmmyyyyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const match = dateStr.trim().match(ddmmyyyyRegex);
    
    if (match) {
      const [, day, month, year] = match;
      // Convert to ISO format YYYY-MM-DD for reliable parsing
      const isoDateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const date = new Date(isoDateStr);
      
      if (isNaN(date.getTime())) {
        console.warn('⚠️ Invalid date after DD/MM/YYYY conversion:', dateStr, 'converted to:', isoDateStr);
        return null;
      }
      return date;
    }
    
    // Try parsing as-is for other formats (MM/DD/YYYY, ISO, etc.)
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn('⚠️ Invalid date string:', dateStr, 'type:', typeof dateStr);
      return null;
    }
    return date;
  } catch (error) {
    console.error('❌ Date parsing error:', error, 'for date:', dateStr);
    return null;
  }
};

/**
 * Formats target date range for display
 * If start and end dates are the same, shows single date
 * Otherwise shows "Start - End" format
 */
export const formatTargetDateRange = (
  startDate: string | null,
  endDate: string | null
): string => {
  // Handle null/undefined/empty cases
  if (!startDate && !endDate) {
    return 'Date TBD';
  }

  // Parse once to avoid duplicate work and ensure consistent formatting
  const parsedStart = safeParseDate(startDate);
  const parsedEnd = safeParseDate(endDate);
  const formattedStart = parsedStart ? parsedStart.toLocaleDateString() : null;
  const formattedEnd = parsedEnd ? parsedEnd.toLocaleDateString() : null;

  // Handle cases where one or both dates failed to format
  if (!formattedStart && !formattedEnd) {
    console.warn('⚠️ Both dates failed to format, showing fallback. Raw values:', { startDate, endDate });
    return 'Date TBD';
  }

  if (!formattedStart && formattedEnd) {
    return formattedEnd;
  }

  if (formattedStart && !formattedEnd) {
    return formattedStart;
  }

  // If both dates are the same (by value after parsing), show single date
  if (
    parsedStart &&
    parsedEnd &&
    parsedStart.toISOString().split('T')[0] === parsedEnd.toISOString().split('T')[0]
  ) {
    return formattedStart!;
  }

  // Show date range
  return `${formattedStart} – ${formattedEnd}`;
};

/**
 * Gets the primary target date for sorting/comparison purposes
 * Uses start date as the primary date for operations
 * Returns current date as fallback if no valid dates are provided
 */
export const getPrimaryTargetDate = (
  startDate: string | null,
  endDate: string | null
): Date => {
  // Try start date first
  if (startDate) {
    const parsedStart = safeParseDate(startDate);
    if (parsedStart) {
      return parsedStart;
    }
  }
  
  // Try end date as fallback
  if (endDate) {
    const parsedEnd = safeParseDate(endDate);
    if (parsedEnd) {
      return parsedEnd;
    }
  }
  
  // Fallback to current date if both are invalid
  console.warn('⚠️ Both start and end dates are invalid, using current date as fallback');
  return new Date();
};

/**
 * Checks if a date range represents a single day
 */
export const isSingleDayRange = (
  startDate: string | null,
  endDate: string | null
): boolean => {
  if (!startDate || !endDate) {
    return true; // Treat incomplete ranges as single day
  }
  const start = safeParseDate(startDate);
  const end = safeParseDate(endDate);
  if (!start || !end) {
    return true; // If either invalid, default to single day
  }
  return start.toISOString().split('T')[0] === end.toISOString().split('T')[0];
};

/**
 * Gets the date range duration in days
 * Returns 1 if either date is invalid
 */
export const getDateRangeDuration = (
  startDate: string | null,
  endDate: string | null
): number => {
  const startParsed = safeParseDate(startDate);
  const endParsed = safeParseDate(endDate);
  
  if (!startParsed || !endParsed) {
    return 1; // Single day for invalid dates
  }
  
  const diffTime = endParsed.getTime() - startParsed.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
  
  return Math.max(1, diffDays); // Minimum 1 day
};

/**
 * Safely formats a date string for display
 * Returns fallback text if date is invalid
 */
export const safeDateFormat = (
  dateStr: string | null | undefined, 
  fallback: string = 'TBD'
): string => {
  const date = safeParseDate(dateStr);
  return date ? date.toLocaleDateString() : fallback;
};

/**
 * Safely formats a date for input fields (YYYY-MM-DD format)
 * Returns empty string if date is invalid
 */
export const safeDateForInput = (dateStr: string | null | undefined): string => {
  const date = safeParseDate(dateStr);
  return date ? date.toISOString().split('T')[0] : '';
}; 
