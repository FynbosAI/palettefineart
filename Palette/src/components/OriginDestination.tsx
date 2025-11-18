import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@mui/material';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEADLINE_OFFSET_DAYS = 7;
export const DEFAULT_DEADLINE_HOUR = 17;

export const addBusinessDays = (start: Date, businessDays: number) => {
  const result = new Date(start.getTime());
  let added = 0;

  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added += 1;
    }
  }

  return result;
};

export const computeDefaultDeadline = (baseDate: Date = new Date()) => {
  const now = new Date(baseDate.getTime());
  now.setMilliseconds(0);
  now.setSeconds(0);
  now.setMinutes(0);

  const defaultDate = new Date(now.getTime());
  defaultDate.setDate(defaultDate.getDate() + DEFAULT_DEADLINE_OFFSET_DAYS);
  defaultDate.setHours(DEFAULT_DEADLINE_HOUR, 0, 0, 0);
  return defaultDate;
};

const toLocalDateTimeValue = (isoValue: string | null) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const fromLocalDateTimeValue = (localValue: string | null) => {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseDateSafe = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTimeForDisplay = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

interface DateRange {
    startDate: string;
    endDate: string;
}

interface OriginDestinationProps {
    arrivalDate: string;
    dateRange?: DateRange;
    origin?: string;
    destination?: string;
    title?: string;             // NEW
    clientReference?: string;
    onDateChange?: (date: string) => void;
    onDateRangeChange?: (range: DateRange | undefined) => void;
    onOriginChange?: (origin: string) => void;
    onDestinationChange?: (destination: string) => void;
    onTitleChange?: (title: string) => void;  // NEW
    onClientReferenceChange?: (reference: string) => void;
    onDateValidationChange?: (isValid: boolean) => void;
    wrapWithCard?: boolean;
    showBiddingDeadline?: boolean;
    biddingDeadline?: string | null;
    autoCloseBidding?: boolean;
    onBiddingDeadlineChange?: (iso: string | null) => void;
    onAutoCloseBiddingChange?: (value: boolean) => void;
    onBiddingDeadlineValidationChange?: (isValid: boolean) => void;
    originContactName?: string;
    originContactPhone?: string;
    originContactEmail?: string;
    destinationContactName?: string;
    destinationContactPhone?: string;
    destinationContactEmail?: string;
    onOriginContactNameChange?: (value: string) => void;
    onOriginContactPhoneChange?: (value: string) => void;
    onOriginContactEmailChange?: (value: string) => void;
    onDestinationContactNameChange?: (value: string) => void;
    onDestinationContactPhoneChange?: (value: string) => void;
    onDestinationContactEmailChange?: (value: string) => void;
}

const LocationPinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '16px', width: '16px', color: '#58517E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const CalendarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '16px', width: '16px', color: '#58517E', marginRight: '8px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2z" />
    </svg>
);

const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ height: '14px', width: '14px', color: '#58517E', marginLeft: '8px', cursor: 'pointer' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);

const textInputStyles: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '14px',
    fontFamily: 'inherit',
    width: '100%'
};

const OriginDestination: React.FC<OriginDestinationProps> = ({ 
    arrivalDate, 
    dateRange,
    origin, 
    destination,
    title,              // NEW
    clientReference,
    onDateChange,
    onDateRangeChange,
    onOriginChange,
    onDestinationChange,
    onTitleChange,      // NEW
    onClientReferenceChange,
    onDateValidationChange,
    wrapWithCard = false,
    showBiddingDeadline = false,
    biddingDeadline = null,
    autoCloseBidding = false,
    onBiddingDeadlineChange,
    onAutoCloseBiddingChange,
    onBiddingDeadlineValidationChange,
    originContactName,
    originContactPhone,
    originContactEmail,
    destinationContactName,
    destinationContactPhone,
    destinationContactEmail,
    onOriginContactNameChange,
    onOriginContactPhoneChange,
    onOriginContactEmailChange,
    onDestinationContactNameChange,
    onDestinationContactPhoneChange,
    onDestinationContactEmailChange
}) => {
    const [isEditingDate, setIsEditingDate] = useState(false);
    const [isEditingOrigin, setIsEditingOrigin] = useState(false);
    const [isEditingDestination, setIsEditingDestination] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);  // NEW
    const [dateValue, setDateValue] = useState(arrivalDate);
    const [originValue, setOriginValue] = useState(origin || 'London, UK');
    const [destinationValue, setDestinationValue] = useState(destination || 'New York, USA');
    const [titleValue, setTitleValue] = useState(title || '');    // NEW
    const [originContactNameValue, setOriginContactNameValue] = useState(originContactName || '');
    const [originContactPhoneValue, setOriginContactPhoneValue] = useState(originContactPhone || '');
    const [originContactEmailValue, setOriginContactEmailValue] = useState(originContactEmail || '');
    const [destinationContactNameValue, setDestinationContactNameValue] = useState(destinationContactName || '');
    const [destinationContactPhoneValue, setDestinationContactPhoneValue] = useState(destinationContactPhone || '');
    const [destinationContactEmailValue, setDestinationContactEmailValue] = useState(destinationContactEmail || '');
    const [clientReferenceValue, setClientReferenceValue] = useState(clientReference || '');
    const [deadlineError, setDeadlineError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            console.log('[SHIPMENT_DEBUG] OriginDestination props snapshot', {
                arrivalDate,
                dateRange,
                biddingDeadline,
                autoCloseBidding,
            });
        }
    }, [arrivalDate, dateRange, biddingDeadline, autoCloseBidding]);

    // Adjust initial range state to check for non-empty dates
    const [isDateRange, setIsDateRange] = useState(!!(dateRange && (dateRange.startDate || dateRange.endDate)));
    const [startDate, setStartDate] = useState(dateRange?.startDate || '');
    const [endDate, setEndDate] = useState(dateRange?.endDate || '');

    const minDeadlineMs = Date.now() + HOUR_MS;

    const minDeadlineInputValue = useMemo(() => (
        toLocalDateTimeValue(new Date(minDeadlineMs).toISOString())
    ), [minDeadlineMs]);

    const firstServiceDate = useMemo(() => {
        const candidate = dateRange?.startDate || arrivalDate || null;
        return parseDateSafe(candidate ?? undefined);
    }, [dateRange?.startDate, arrivalDate]);

    const arrivalStartDate = useMemo(() => {
        if (!firstServiceDate) return null;
        const normalized = new Date(firstServiceDate);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }, [firstServiceDate]);

    const latestAllowedDeadline = useMemo(() => {
        if (!arrivalStartDate) return null;
        return new Date(arrivalStartDate.getTime() - 2 * DAY_MS);
    }, [arrivalStartDate]);

    const recommendedFromArrival = useMemo(() => {
        if (!arrivalStartDate) return null;
        const recommended = new Date(arrivalStartDate.getTime() - 5 * DAY_MS);
        recommended.setHours(DEFAULT_DEADLINE_HOUR, 0, 0, 0);
        if (recommended.getTime() < minDeadlineMs) return null;
        return recommended;
    }, [arrivalStartDate, minDeadlineMs]);

    const fallbackDefaultDeadline = useMemo(() => {
        const defaultDeadline = computeDefaultDeadline();
        if (defaultDeadline.getTime() < minDeadlineMs) {
            const minDate = new Date(minDeadlineMs);
            minDate.setSeconds(0, 0);
            return minDate;
        }
        return defaultDeadline;
    }, [minDeadlineMs]);

    const recommendedDeadlineDate = useMemo(() => (
        recommendedFromArrival ?? fallbackDefaultDeadline
    ), [recommendedFromArrival, fallbackDefaultDeadline]);

    const recommendedDeadlineIso = useMemo(() => (
        recommendedDeadlineDate.toISOString()
    ), [recommendedDeadlineDate]);

    const recommendedDeadlineText = useMemo(() => (
        formatDateTimeForDisplay(recommendedDeadlineDate)
    ), [recommendedDeadlineDate]);

    const arrivalDisplayDate = useMemo(() => {
        if (!arrivalStartDate) return null;
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }).format(arrivalStartDate);
    }, [arrivalStartDate]);

    const maxDeadlineInputValue = useMemo(() => {
        if (!latestAllowedDeadline) return undefined;
        if (latestAllowedDeadline.getTime() <= minDeadlineMs) return undefined;
        return toLocalDateTimeValue(latestAllowedDeadline.toISOString());
    }, [latestAllowedDeadline, minDeadlineMs]);

    const deadlineInputValue = useMemo(() => (
        toLocalDateTimeValue(biddingDeadline)
    ), [biddingDeadline]);

    const noAvailableDeadlineWindow = useMemo(() => {
        if (!showBiddingDeadline || !autoCloseBidding) return false;
        if (!arrivalStartDate || !latestAllowedDeadline) return false;
        return latestAllowedDeadline.getTime() <= minDeadlineMs;
    }, [showBiddingDeadline, autoCloseBidding, arrivalStartDate, latestAllowedDeadline, minDeadlineMs]);

    const getDeadlineValidation = useCallback((deadlineIso: string | null) => {
        if (!showBiddingDeadline) {
            return { valid: true, error: null } as const;
        }

        if (!autoCloseBidding) {
            return { valid: true, error: null } as const;
        }

        if (noAvailableDeadlineWindow) {
            return {
                valid: false,
                error: 'Arrival date is too soon to auto-close estimate submissions. Adjust the arrival date or disable automatic closing.',
            } as const;
        }

        if (!deadlineIso) {
            return {
                valid: false,
                error: 'Select an estimate deadline to auto-close quotes.',
            } as const;
        }

        const deadlineDate = parseDateSafe(deadlineIso);
        if (!deadlineDate) {
            return {
                valid: false,
                error: 'Deadline must be a valid date and time.',
            } as const;
        }

        const now = Date.now();
        if (deadlineDate.getTime() <= now) {
            return {
                valid: false,
                error: 'Deadline must be in the future.',
            } as const;
        }

        if (deadlineDate.getTime() < minDeadlineMs) {
            return {
                valid: false,
                error: 'Deadline must be at least one hour from now.',
            } as const;
        }

        if (arrivalStartDate) {
            const diffMs = arrivalStartDate.getTime() - deadlineDate.getTime();
            if (diffMs < 2 * DAY_MS) {
                const arrivalLabel = arrivalDisplayDate ? arrivalDisplayDate : 'the arrival date';
                return {
                    valid: false,
                    error: `Deadline must be at least two days before ${arrivalLabel}.`,
                } as const;
            }
        }

        if (latestAllowedDeadline && deadlineDate.getTime() > latestAllowedDeadline.getTime()) {
            const arrivalLabel = arrivalDisplayDate ? arrivalDisplayDate : 'the arrival date';
            return {
                valid: false,
                error: `Deadline must be at least two days before ${arrivalLabel}.`,
            } as const;
        }

        return { valid: true, error: null } as const;
    }, [showBiddingDeadline, autoCloseBidding, noAvailableDeadlineWindow, arrivalStartDate, arrivalDisplayDate, latestAllowedDeadline, minDeadlineMs]);

    const applyDeadlineValidation = useCallback((deadlineIso: string | null) => {
        const { valid, error } = getDeadlineValidation(deadlineIso);
        if (showBiddingDeadline) {
            setDeadlineError(error);
            if (onBiddingDeadlineValidationChange) {
                onBiddingDeadlineValidationChange(valid);
            }
        }
        return valid;
    }, [getDeadlineValidation, onBiddingDeadlineValidationChange, showBiddingDeadline]);

    useEffect(() => {
        setDateValue(arrivalDate);
        // Auto-enter edit mode if no date is provided
        if (!arrivalDate && !dateRange) {
            setIsEditingDate(true);
        }
    }, [arrivalDate, dateRange]);

    useEffect(() => {
        if (dateRange && (dateRange.startDate || dateRange.endDate)) {
            setIsDateRange(true);
            setStartDate(dateRange.startDate);
            setEndDate(dateRange.endDate);
        } else {
            // Empty or undefined dateRange means single-date mode
            setIsDateRange(false);
            setStartDate('');
            setEndDate('');
        }
    }, [dateRange]);

    // Validation logic
    const validateDates = () => {
        if (isDateRange) {
            return !!(startDate && endDate);
        } else {
            return !!dateValue;
        }
    };

    // Effect to call validation callback whenever date state changes
    useEffect(() => {
        const isValid = validateDates();
        if (onDateValidationChange) {
            onDateValidationChange(isValid);
        }
    }, [isDateRange, dateValue, startDate, endDate, onDateValidationChange]);

    useEffect(() => {
        setOriginValue(origin || 'London, UK');
    }, [origin]);

    useEffect(() => {
        setDestinationValue(destination || 'New York, USA');
    }, [destination]);

    useEffect(() => {
        setTitleValue(title || '');
    }, [title]);

    useEffect(() => {
        setOriginContactNameValue(originContactName || '');
    }, [originContactName]);

    useEffect(() => {
        setOriginContactPhoneValue(originContactPhone || '');
    }, [originContactPhone]);

    useEffect(() => {
        setOriginContactEmailValue(originContactEmail || '');
    }, [originContactEmail]);

    useEffect(() => {
        setDestinationContactNameValue(destinationContactName || '');
    }, [destinationContactName]);

    useEffect(() => {
        setDestinationContactPhoneValue(destinationContactPhone || '');
    }, [destinationContactPhone]);

    useEffect(() => {
        setDestinationContactEmailValue(destinationContactEmail || '');
    }, [destinationContactEmail]);

    useEffect(() => {
        setClientReferenceValue(clientReference || '');
    }, [clientReference]);

    useEffect(() => {
        if (!showBiddingDeadline) return;
        applyDeadlineValidation(biddingDeadline);
    }, [showBiddingDeadline, biddingDeadline, applyDeadlineValidation]);

    useEffect(() => {
        if (!showBiddingDeadline) return;

        if (!autoCloseBidding) {
            applyDeadlineValidation(biddingDeadline);
            return;
        }

        if (noAvailableDeadlineWindow) {
            applyDeadlineValidation(biddingDeadline);
            return;
        }

        if (!biddingDeadline) {
            if (getDeadlineValidation(recommendedDeadlineIso).valid) {
                onBiddingDeadlineChange?.(recommendedDeadlineIso);
            }
            return;
        }

        const currentValidation = getDeadlineValidation(biddingDeadline);
        if (!currentValidation.valid) {
            const recommendedValidation = getDeadlineValidation(recommendedDeadlineIso);
            if (recommendedValidation.valid && recommendedDeadlineIso !== biddingDeadline) {
                onBiddingDeadlineChange?.(recommendedDeadlineIso);
            } else {
                applyDeadlineValidation(biddingDeadline);
            }
        }
    }, [showBiddingDeadline, autoCloseBidding, biddingDeadline, recommendedDeadlineIso, onBiddingDeadlineChange, getDeadlineValidation, applyDeadlineValidation, noAvailableDeadlineWindow]);

    const formatDateForInput = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                console.warn('⚠️ Invalid date in formatDateForInput:', dateString);
                return '';
            }
            return date.toISOString().split('T')[0];
        } catch (error) {
            console.error('❌ Date parsing error in formatDateForInput:', error);
            return '';
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;
        setDateValue(newDate);
        if (onDateChange) {
            onDateChange(newDate);
        }
    };

    const handleEditDateClick = () => {
        setIsEditingDate(true);
    };

    const handleEditOriginClick = () => {
        setIsEditingOrigin(true);
    };

    const handleEditDestinationClick = () => {
        setIsEditingDestination(true);
    };

    const handleDateModeToggle = () => {
        const nextIsRange = !isDateRange;
        setIsDateRange(nextIsRange);
        setIsEditingDate(true);

        if (nextIsRange) {
            // Switching to range mode
            setDateValue('');
            if (onDateChange) onDateChange('');
        } else {
            // Switching to single date mode
            setStartDate('');
            setEndDate('');
            if (onDateRangeChange) onDateRangeChange(undefined);
        }
    };

    const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newStartDate = e.target.value;
        setStartDate(newStartDate);
        
        if (onDateRangeChange) {
            onDateRangeChange({ startDate: newStartDate, endDate });
        }
    };

    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newEndDate = e.target.value;
        setEndDate(newEndDate);
        
        if (onDateRangeChange) {
            onDateRangeChange({ startDate, endDate: newEndDate });
        }
    };

    const handleDateBlur = () => {
        if (isDateRange) {
            if (startDate && endDate) {
                setIsEditingDate(false);
            }
        } else {
            if (dateValue) {
                setIsEditingDate(false);
            }
        }
    };

    const handleOriginBlur = () => {
        setIsEditingOrigin(false);
        if (onOriginChange && originValue !== origin) {
            onOriginChange(originValue);
        }
    };

    const handleDestinationBlur = () => {
        setIsEditingDestination(false);
        if (onDestinationChange && destinationValue !== destination) {
            onDestinationChange(destinationValue);
        }
    };

    const handleDateKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isDateRange) {
                if (startDate && endDate) {
                    setIsEditingDate(false);
                }
            } else {
                if (dateValue) {
                    setIsEditingDate(false);
                }
            }
        }
    };

    const handleOriginKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditingOrigin(false);
            if (onOriginChange && originValue !== origin) {
                onOriginChange(originValue);
            }
        }
    };

    const handleDestinationKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditingDestination(false);
            if (onDestinationChange && destinationValue !== destination) {
                onDestinationChange(destinationValue);
            }
        }
    };

    const handleOriginInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setOriginValue(e.target.value);
    };

    const handleDestinationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDestinationValue(e.target.value);
    };

    const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitleValue(e.target.value);
    };

    const handleEditTitleClick = () => {
        setIsEditingTitle(true);
    };

    const handleTitleBlur = () => {
        setIsEditingTitle(false);
        if (onTitleChange && titleValue !== title) {
            onTitleChange(titleValue);
        }
    };

    const handleTitleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditingTitle(false);
            if (onTitleChange && titleValue !== title) {
                onTitleChange(titleValue);
            }
        }
    };

    const handleOriginContactNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setOriginContactNameValue(value);
        onOriginContactNameChange?.(value);
    };

    const handleOriginContactPhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setOriginContactPhoneValue(value);
        onOriginContactPhoneChange?.(value);
    };

    const handleOriginContactEmailInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setOriginContactEmailValue(value);
        onOriginContactEmailChange?.(value);
    };

    const handleDestinationContactNameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDestinationContactNameValue(value);
        onDestinationContactNameChange?.(value);
    };

    const handleDestinationContactPhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDestinationContactPhoneValue(value);
        onDestinationContactPhoneChange?.(value);
    };

    const handleDestinationContactEmailInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDestinationContactEmailValue(value);
        onDestinationContactEmailChange?.(value);
    };

    const handleClientReferenceInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setClientReferenceValue(e.target.value);
    };

    const handleClientReferenceBlur = () => {
        if (onClientReferenceChange) {
            onClientReferenceChange(clientReferenceValue.trim());
        }
    };

    const handleClientReferenceKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleClientReferenceBlur();
        }
    };

    const handleBiddingDeadlineInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!showBiddingDeadline) return;
        const inputValue = event.target.value;
        const isoValue = fromLocalDateTimeValue(inputValue);
        onBiddingDeadlineChange?.(isoValue);
        applyDeadlineValidation(isoValue);
    };

    const handleBiddingDeadlineBlur = () => {
        if (!showBiddingDeadline) return;
        applyDeadlineValidation(biddingDeadline);
    };

    const handleUseRecommendedDeadline = () => {
        if (!showBiddingDeadline) return;
        const recommendedIso = recommendedDeadlineIso;
        onBiddingDeadlineChange?.(recommendedIso);
        applyDeadlineValidation(recommendedIso);
    };

    const handleAutoCloseToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked;
        onAutoCloseBiddingChange?.(nextValue);

        if (!showBiddingDeadline) return;

        if (!nextValue) {
            setDeadlineError(null);
            onBiddingDeadlineValidationChange?.(true);
            return;
        }

        const nextWindowUnavailable = arrivalStartDate && latestAllowedDeadline
            ? latestAllowedDeadline.getTime() <= minDeadlineMs
            : false;

        if (!biddingDeadline || !getDeadlineValidation(biddingDeadline).valid) {
            const recommendedIso = recommendedDeadlineIso;
            if (!nextWindowUnavailable && getDeadlineValidation(recommendedIso).valid) {
                onBiddingDeadlineChange?.(recommendedIso);
                applyDeadlineValidation(recommendedIso);
                return;
            }
        }

        if (nextWindowUnavailable) {
            applyDeadlineValidation(biddingDeadline);
            return;
        }

        applyDeadlineValidation(biddingDeadline);
    };

    const formatDateDisplay = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                console.warn('⚠️ Invalid date in formatDateDisplay:', dateString);
                return 'Date TBD';
            }
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (error) {
            console.error('❌ Date parsing error in formatDateDisplay:', error);
            return 'Date TBD';
        }
    };

    const renderDateInput = () => {
        if (isDateRange) {
            return (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: '#666' }}>From</label>
                        <input
                            type="date"
                            value={formatDateForInput(startDate)}
                            onChange={handleStartDateChange}
                            onBlur={handleDateBlur}
                            onKeyPress={handleDateKeyPress}
                            style={{
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                width: '140px'
                            }}
                            placeholder="Start date"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: '#666' }}>To</label>
                        <input
                            type="date"
                            value={formatDateForInput(endDate)}
                            onChange={handleEndDateChange}
                            onBlur={handleDateBlur}
                            onKeyPress={handleDateKeyPress}
                            min={startDate} // Ensure end date is not before start date
                            style={{
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                width: '140px'
                            }}
                            placeholder="End date"
                        />
                    </div>
                </div>
            );
        } else {
            return (
                <input
                    type="date"
                    value={formatDateForInput(dateValue)}
                    onChange={handleDateChange}
                    onBlur={handleDateBlur}
                    onKeyPress={handleDateKeyPress}
                    autoFocus
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                    }}
                    placeholder="Select a date"
                />
            );
        }
    };

    const renderDateDisplay = () => {
        if (isDateRange) {
            if (startDate && endDate) {
                return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
            } else if (startDate) {
                return `From ${formatDateDisplay(startDate)}`;
            } else {
                return 'Click to set date range';
            }
        } else {
            return dateValue ? 
                formatDateDisplay(dateValue) :
                'Click to set date';
        }
    };

    const routeContent = (
        <div>
            <h2>Estimate Title</h2>
            {isEditingTitle ? (
                <input
                    type="text"
                    value={titleValue}
                    onChange={handleTitleInputChange}
                    onBlur={handleTitleBlur}
                    onKeyPress={handleTitleKeyPress}
                    autoFocus
                    placeholder="Enter Estimate title (e.g., 3 Paintings to Paris)"
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        width: '100%',
                        marginBottom: '20px'
                    }}
                />
            ) : (
                <p onClick={handleEditTitleClick} style={{ 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center',
                    marginBottom: '20px',
                    padding: '8px 12px',
                    border: '1px solid transparent',
                    borderRadius: '4px',
                    transition: 'background 0.2s'
                }}>
                    {titleValue || 'Click to add shipment title'}
                    <EditIcon />
                </p>
            )}

            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '8px' }}>
                    Client Reference <span style={{ color: 'rgba(23, 8, 73, 0.6)', fontWeight: 400 }}>(optional)</span>
                </h3>
                <input
                    type="text"
                    value={clientReferenceValue}
                    onChange={handleClientReferenceInputChange}
                    onBlur={handleClientReferenceBlur}
                    onKeyPress={handleClientReferenceKeyPress}
                    placeholder="e.g., Christie's REF 12345"
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                        width: '100%'
                    }}
                />
                <p style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.6)', marginTop: '6px' }}>
                    Appears on shipper estimates so they can match this request to your internal reference number.
                </p>
            </div>

            <h2>Route Details</h2>
            <div className="origin-destination">
                <div className="location">
                    <h3>Origin</h3>
                    {isEditingOrigin ? (
                        <input
                            type="text"
                            value={originValue}
                            onChange={handleOriginInputChange}
                            onBlur={handleOriginBlur}
                            onKeyPress={handleOriginKeyPress}
                            autoFocus
                            style={{
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                width: '100%'
                            }}
                        />
                    ) : (
                        <p onClick={handleEditOriginClick} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            {originValue}
                        </p>
                    )}
                </div>
                <div style={{ width: '100%', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', fontWeight: 500 }}>Pickup contact (optional)</label>
                    <input
                        type="text"
                        value={originContactNameValue}
                        onChange={handleOriginContactNameInputChange}
                        placeholder="Name"
                        style={textInputStyles}
                    />
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={originContactPhoneValue}
                            onChange={handleOriginContactPhoneInputChange}
                            placeholder="Phone"
                            style={{ ...textInputStyles, flex: 1, minWidth: '160px' }}
                        />
                        <input
                            type="email"
                            value={originContactEmailValue}
                            onChange={handleOriginContactEmailInputChange}
                            placeholder="Email"
                            style={{ ...textInputStyles, flex: 1, minWidth: '160px' }}
                        />
                    </div>
                </div>
                <div className="location">
                    <h3>Destination</h3>
                    {isEditingDestination ? (
                        <input
                            type="text"
                            value={destinationValue}
                            onChange={handleDestinationInputChange}
                            onBlur={handleDestinationBlur}
                            onKeyPress={handleDestinationKeyPress}
                            autoFocus
                            style={{
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '14px',
                                fontFamily: 'inherit',
                                width: '100%'
                            }}
                        />
                    ) : (
                        <p onClick={handleEditDestinationClick} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            {destinationValue}
                            <EditIcon />
                        </p>
                    )}
                </div>
                <div style={{ width: '100%', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)', fontWeight: 500 }}>Delivery contact (optional)</label>
                    <input
                        type="text"
                        value={destinationContactNameValue}
                        onChange={handleDestinationContactNameInputChange}
                        placeholder="Name"
                        style={textInputStyles}
                    />
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={destinationContactPhoneValue}
                            onChange={handleDestinationContactPhoneInputChange}
                            placeholder="Phone"
                            style={{ ...textInputStyles, flex: 1, minWidth: '160px' }}
                        />
                        <input
                            type="email"
                            value={destinationContactEmailValue}
                            onChange={handleDestinationContactEmailInputChange}
                            placeholder="Email"
                            style={{ ...textInputStyles, flex: 1, minWidth: '160px' }}
                        />
                    </div>
                </div>
            </div>
            <div className="required-by">
                <CalendarIcon />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div className="required-by-label">Arrival Date</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Button
                                onClick={handleDateModeToggle}
                                variant={!isDateRange ? "contained" : "outlined"}
                                size="small"
                                sx={{
                                    background: !isDateRange ? '#8412ff' : 'transparent',
                                    color: !isDateRange ? '#ead9f9' : '#8412ff',
                                    borderColor: '#8412ff',
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    padding: '4px 12px',
                                    minWidth: 'auto',
                                    '&:hover': {
                                        background: !isDateRange ? '#730add' : 'rgba(132, 18, 255, 0.04)',
                                        borderColor: '#730add',
                                    },
                                }}
                            >
                                Specific Date
                            </Button>
                            <Button
                                onClick={handleDateModeToggle}
                                variant={isDateRange ? "contained" : "outlined"}
                                size="small"
                                sx={{
                                    background: isDateRange ? '#8412ff' : 'transparent',
                                    color: isDateRange ? '#ead9f9' : '#8412ff',
                                    borderColor: '#8412ff',
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    padding: '4px 12px',
                                    minWidth: 'auto',
                                    '&:hover': {
                                        background: isDateRange ? '#730add' : 'rgba(132, 18, 255, 0.04)',
                                        borderColor: '#730add',
                                    },
                                }}
                            >
                                Date Range
                            </Button>
                        </div>
                    </div>
                    <div className="required-by-date" style={{ display: 'flex', alignItems: 'center' }}>
                        {isEditingDate ? (
                            renderDateInput()
                        ) : (
                            <span onClick={handleEditDateClick} style={{ cursor: 'pointer' }}>
                                {renderDateDisplay()}
                                {(dateValue || (startDate && endDate)) && <EditIcon />}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    const biddingContent = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
                <h2 style={{ marginBottom: '4px' }}>Estimate Deadline</h2>
                <p style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.7)' }}>
                    Shippers lose estimate submission access once the deadline passes. The deadline must be set at least two full days before the arrival date.
                </p>
            </div>

            <label htmlFor="bidding-deadline-input" style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(23, 8, 73, 0.7)' }}>
                Deadline (local time)
            </label>
            <input
                id="bidding-deadline-input"
                type="datetime-local"
                value={deadlineInputValue}
                onChange={handleBiddingDeadlineInputChange}
                onBlur={handleBiddingDeadlineBlur}
                min={minDeadlineInputValue}
                max={maxDeadlineInputValue}
                disabled={!autoCloseBidding || noAvailableDeadlineWindow}
                style={{
                    border: `1px solid ${deadlineError ? '#d14343' : '#ddd'}`,
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    backgroundColor: autoCloseBidding && !noAvailableDeadlineWindow ? '#fff' : '#f5f5f5',
                    color: autoCloseBidding && !noAvailableDeadlineWindow ? '#170849' : '#8a84a7',
                }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {deadlineError ? (
                    <span style={{ fontSize: '12px', color: '#d14343' }}>{deadlineError}</span>
                ) : noAvailableDeadlineWindow ? (
                    <span style={{ fontSize: '12px', color: '#d14343' }}>
                        Arrival is less than two days away. Adjust the arrival date or disable automatic closing.
                    </span>
                ) : (
                    <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.6)' }}>
                        Recommended deadline: {recommendedDeadlineText}{arrivalStartDate ? ' (five days before arrival).' : ' (one week from today).'}
                    </span>
                )}
                <Button
                    variant="text"
                    size="small"
                    onClick={handleUseRecommendedDeadline}
                    disabled={!autoCloseBidding || noAvailableDeadlineWindow}
                    sx={{ alignSelf: 'flex-start', padding: 0, minWidth: 'auto', textTransform: 'none' }}
                >
                    Use recommended deadline
                </Button>
            </div>

            {/* <label htmlFor="auto-close-bidding" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#170849' }}>
                <input
                    id="auto-close-bidding"
                    type="checkbox"
                    checked={autoCloseBidding}
                    onChange={handleAutoCloseToggle}
                    style={{ width: '16px', height: '16px' }}
                />
                Automatically close bidding at this time
            </label>
            {!autoCloseBidding && (
                <span style={{ fontSize: '12px', color: 'rgba(23, 8, 73, 0.6)' }}>
                    Estimate submissions will stay open until you manually close the quote.
                </span>
            )} */}
        </div>
    );

    return (
        <>
            {wrapWithCard ? (
                <div className="detail-card">
                    {routeContent}
                </div>
            ) : routeContent}
            {showBiddingDeadline ? (
                wrapWithCard ? (
                    <div className="detail-card">
                        {biddingContent}
                    </div>
                ) : (
                    biddingContent
                )
            ) : null}
        </>
    );
};

export default OriginDestination;
