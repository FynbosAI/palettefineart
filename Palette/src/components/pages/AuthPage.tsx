import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Link,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { supabase, OrganizationRequestService, AuthService } from '../../lib/supabase';
import type { SignupOrganization } from '../../lib/supabase/organization-requests';
import useSupabaseStore from '../../store/useSupabaseStore';
import logger from '../../lib/utils/logger';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setProfile } = useSupabaseStore();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Responsive breakpoints hook
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowSize.width <= 768;
  const isTablet = windowSize.width > 768 && windowSize.width <= 1440;
  const isDesktop = windowSize.width > 1440;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') {
      setIsLogin(true);
      setSuccess('Your password has been updated. Please sign in with your new password.');
      params.delete('reset');
      const nextSearch = params.toString();
      navigate({
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      }, { replace: true, state: location.state });
    }
  }, [location.pathname, location.search, location.state, navigate]);

  // Organization state
  const [organizations, setOrganizations] = useState<SignupOrganization[]>([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const RESET_COOLDOWN_SECONDS = 60;
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetCooldownRemaining, setResetCooldownRemaining] = useState(0);
  
  useEffect(() => {
    if (resetCooldownRemaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResetCooldownRemaining(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [resetCooldownRemaining]);
  
  // Organization autocomplete state
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [filteredOrganizations, setFilteredOrganizations] = useState<SignupOrganization[]>([]);
  const [selectedOrgName, setSelectedOrgName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    selectedOrgId: '',
    confirmPassword: '',
    // Request dialog fields
    requestOrgName: '',
    justification: ''
  });

  // Decide destination after successful auth and navigate accordingly
  const normalizeRedirectPath = (raw?: string | null) => {
    if (!raw) return '/dashboard';
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/dashboard';
    if (trimmed === '/' || trimmed.startsWith('/auth')) return '/dashboard';
    return trimmed;
  };

  const decideDestinationAndNavigate = () => {
    try {
      setSuccess('Login successful! Preparing your workspace...');

      const params = new URLSearchParams(location.search);
      const rawRedirect = params.get('redirect');
      const redirectPath = normalizeRedirectPath(rawRedirect);

      if (rawRedirect) {
        try {
          sessionStorage.setItem('palette:postAuthRedirect', redirectPath);
        } catch (storageError) {
          console.warn('Unable to persist post-auth redirect path:', storageError);
        }
      } else {
        try {
          sessionStorage.removeItem('palette:postAuthRedirect');
        } catch {}
      }

      setTimeout(() => {
        setSuccess('Welcome back. Redirecting...');
        navigate(redirectPath, { replace: true });
      }, 400);
    } catch (e) {
      console.error('Destination decision error:', e);
      navigate('/dashboard', { replace: true });
    }
  };

  // Check if user is already logged in - but skip if we just logged out
  useEffect(() => {
    // Support cross-app logout bounce: /auth?logout=1&return=...
    const params = new URLSearchParams(location.search);
    const doLogout = params.get('logout');
    const returnTo = params.get('return');
    if (doLogout === '1') {
      (async () => {
        try {
          await supabase.auth.signOut({ scope: 'global' as any });
        } catch {}
        // Force clear any lingering Supabase auth storage
        try {
          Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); });
          Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) sessionStorage.removeItem(k); });
        } catch {}
        useSupabaseStore.getState().clearStore();
        // Clean URL and navigate
        const target = returnTo || '/auth';
        window.location.replace(target);
      })();
      return;
    }

    // Skip auto-redirect if we just logged out
    if (location.state?.loggedOut) {
      logger.debug('AuthPage', 'Skipping auto-redirect - user just logged out');
      return;
    }

    // Subscribe to auth state changes instead of one-time check
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.auth('AuthPage', event, !!session);
        if (event === 'SIGNED_IN' && session) {
          // Ensure store has user and profile before routing to avoid race
          try {
            setUser(session.user);
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (profile) setProfile(profile);
          } catch (err) {
            console.warn('AuthPage: background init after SIGNED_IN failed (non-fatal)', err);
          }
          logger.debug('AuthPage', 'User signed in, deciding destination');
          decideDestinationAndNavigate();
        }
      }
    );

    // Also do an initial check in case user is already logged in
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Ensure store has user and profile on reloads before routing
          try {
            setUser(session.user);
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (profile) setProfile(profile);
          } catch (err) {
            console.warn('AuthPage: background init for existing session failed (non-fatal)', err);
          }
          logger.debug('AuthPage', 'Found existing session, deciding destination');
          decideDestinationAndNavigate();
        }
      } catch (error) {
        console.error('🔍 AuthPage: Error checking initial session:', error);
      }
    };

    checkInitialSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, location.state?.loggedOut]);

  // Load organizations for dropdown
  useEffect(() => {
    const loadOrganizations = async () => {
      const { data, error } = await OrganizationRequestService.getAllOrganizations();
      if (data) {
        setOrganizations(data);
        setFilteredOrganizations(data);
      }
    };
    loadOrganizations();
  }, []);

  // Filter organizations based on search query
  useEffect(() => {
    if (!orgSearchQuery.trim()) {
      setFilteredOrganizations(organizations);
    } else {
      const query = orgSearchQuery.toLowerCase();
      const filtered = organizations.filter(org => {
        const companyMatch = org.company_name?.toLowerCase().includes(query);
        const branchMatch = org.branches?.some(branch => branch.branch_name?.toLowerCase().includes(query));
        return Boolean(companyMatch || branchMatch);
      });
      setFilteredOrganizations(filtered);
    }
  }, [orgSearchQuery, organizations]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const resolveBranchOrgId = (org: SignupOrganization): string | null => {
    if (!org?.branches || org.branches.length === 0) {
      return null;
    }
    const primary = org.branches.find(branch => branch.branch_name?.toLowerCase() === 'primary');
    return (primary || org.branches[0]).branch_org_id;
  };

  const handleOrgSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOrgSearchQuery(value);
    setShowOrgDropdown(true);
    
    // Clear selection if user is typing
    if (value !== selectedOrgName) {
      setFormData(prev => ({ ...prev, selectedOrgId: '' }));
      setSelectedOrgName('');
      setSelectedCompanyId('');
    }
  };

  const handleOrgSelect = (org: SignupOrganization) => {
    const branchId = resolveBranchOrgId(org);
    if (!branchId) {
      setError('Selected organization is not branch-enabled yet. Please contact support.');
      return;
    }

    setFormData(prev => ({ ...prev, selectedOrgId: branchId }));
    setSelectedOrgName(org.company_name);
    setSelectedCompanyId(org.company_org_id);
    setOrgSearchQuery(org.company_name);
    setShowOrgDropdown(false);
    setError(null);
  };

  const handleOrgInputFocus = () => {
    setShowOrgDropdown(true);
  };

  const handleOrgInputBlur = () => {
    // Delay hiding dropdown to allow clicking on options
    setTimeout(() => setShowOrgDropdown(false), 200);
  };

  const handleOpenResetDialog = () => {
    setResetEmail(formData.email);
    setResetError(null);
    setResetSuccess(null);
    setShowResetDialog(true);
  };

  const handleCloseResetDialog = () => {
    setShowResetDialog(false);
  };

  const handleResetEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setResetEmail(event.target.value);
    setResetError(null);
  };

  const handlePasswordResetRequest = async (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }

    const emailToSend = resetEmail.trim();
    if (!emailToSend) {
      setResetError('Please enter the email you use to sign in.');
      return;
    }

    setResetLoading(true);
    setResetError(null);

    try {
      const { success, error } = await AuthService.requestPasswordReset(emailToSend);
      if (!success && error) {
        setResetSuccess(null);
        setResetError(error);
        return;
      }

      setResetSuccess('If that email is registered, you will receive reset instructions shortly.');
      setResetCooldownRemaining(RESET_COOLDOWN_SECONDS);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send reset link. Please try again.';
      setResetSuccess(null);
      setResetError(message);
    } finally {
      setResetLoading(false);
    }
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }

    if (!isLogin) {
      if (!formData.fullName) {
        setError('Full name is required');
        return false;
      }
      if (!formData.selectedOrgId) {
        setError('Please select an organization or request access to a new one');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        return false;
      }
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        setError(error.message);
      } else if (data.user) {
        // Set user in store
        setUser(data.user);
        
        // Fetch user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
        
        if (profile) {
          setProfile(profile);
        }
        
        // After login, decide destination (Gallery vs Shipper)
        decideDestinationAndNavigate();
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create user account
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        const { data: branchLookup, error: resolveError } = await supabase.rpc('resolve_preapproved_branch', {
          p_email: formData.email
        });

        let branchOrgId = formData.selectedOrgId;
        const branchMatch = Array.isArray(branchLookup) ? branchLookup[0] : null;

        if (resolveError) {
          console.warn('[AuthPage] Failed to resolve pre-approved branch:', resolveError.message);
        }

        if (branchMatch?.branch_org_id) {
          if (selectedCompanyId && branchMatch.company_org_id && branchMatch.company_org_id !== selectedCompanyId) {
            setError('Your email is pre-approved for a different company branch. Please select the correct company or contact support.');
            setLoading(false);
            return;
          }
          branchOrgId = branchMatch.branch_org_id as string;
        }

        if (!branchOrgId) {
          setError('No branch selected or pre-approved. Please choose an organization or contact support.');
          setLoading(false);
          return;
        }

        // Step 2: Check if user is pre-approved and join organization
        const { data: joinResult, error: joinError } = await supabase.rpc('join_organization_if_approved', {
          user_email: formData.email,
          user_id: data.user.id,
          org_id: branchOrgId
        });

        const joinPayload = Array.isArray(joinResult) ? joinResult[0] : joinResult;

        if (joinError || !joinPayload?.success) {
          const errorMessage = joinError?.message || joinPayload?.message || 'Unknown error';
          console.error('Failed to join organization:', errorMessage);
          
          // Show specific error message to user
          setError(errorMessage);
          
          // Don't create access request - user needs to be pre-approved
          return;
        } else {
          // Step 3: Set user in store and redirect
          setUser(data.user);
          
          // Fetch user profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
          
          if (profile) {
            setProfile(profile);
          }
          
          const userRole = joinPayload?.role || 'viewer';
          setSuccess(`Welcome! You've joined as ${userRole}. Loading your dashboard...`);
          
          // After signup, decide destination (Gallery vs Shipper)
          decideDestinationAndNavigate();
        }
        
        // Clear form
        setFormData({
          email: '',
          password: '',
          fullName: '',
          selectedOrgId: '',
          confirmPassword: '',
          requestOrgName: '',
          justification: ''
        });
        
        // Clear autocomplete state
        setOrgSearchQuery('');
        setSelectedOrgName('');
        setSelectedCompanyId('');
        setShowOrgDropdown(false);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Signup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!formData.requestOrgName.trim()) {
      setError('Organization name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First create the user account
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        // Submit organization access request
        const { error: requestError } = await OrganizationRequestService.submitAccessRequest({
          user_id: data.user.id,
          organization_name: formData.requestOrgName,
          user_email: formData.email,
          user_full_name: formData.fullName,
          justification: formData.justification || 'User requested access to new organization during signup.'
        });

        if (requestError) {
          setError(`Failed to submit request: ${requestError.message}`);
          return;
        }

        setSuccess('Account created and organization access requested! An admin will review your request.');
        setShowRequestDialog(false);
        
        // Clear form
        setFormData({
          email: '',
          password: '',
          fullName: '',
          selectedOrgId: '',
          confirmPassword: '',
          requestOrgName: '',
          justification: ''
        });
        
        // Clear autocomplete state
        setOrgSearchQuery('');
        setSelectedOrgName('');
        setSelectedCompanyId('');
        setShowOrgDropdown(false);
        
        // Switch to login mode
        setTimeout(() => {
          setIsLogin(true);
          setSuccess('Please wait for admin approval, then login.');
        }, 3000);
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Request access error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      handleLogin();
    } else {
      handleSignup();
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setSuccess(null);
    setFormData({
      email: '',
      password: '',
      fullName: '',
      selectedOrgId: '',
      confirmPassword: '',
      requestOrgName: '',
      justification: ''
    });
    
    // Clear autocomplete state
    setOrgSearchQuery('');
    setSelectedOrgName('');
    setShowOrgDropdown(false);
  };

  const authCardWrapperStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 60,
    display: 'flex',
    justifyContent: isDesktop ? 'flex-end' : 'center',
    alignItems: isMobile ? 'flex-start' : 'center',
    minHeight: '100vh',
    width: '100%',
    padding: isMobile ? '72px 16px 32px 16px' : isTablet ? '80px 48px 48px 48px' : '96px 80px 96px 80px',
    boxSizing: 'border-box'
  };

  const authCardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: isDesktop ? '460px' : isTablet ? '420px' : '100%',
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: '10px',
    boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
    padding: isMobile ? '24px' : '32px',
    boxSizing: 'border-box',
    overflow: 'auto',
    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
    minHeight: isMobile ? 'auto' : '60vh'
  };

  return (
    <>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#EAD9F9', // Brand lavender background
          position: 'relative',
          overflow: 'hidden',
          fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        {/* Background container - scales as one unit while maintaining relative positions */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            transform: isMobile ? 'scale(0.7)' : isTablet ? 'scale(0.85)' : 'scale(1)',
            transformOrigin: 'top left',
            zIndex: 50
          }}
        >
        {/* Logo PNG - maintains original positioning relative to background */}
        <div
          style={{
            position: 'absolute',
            left: -187,
            top: 37,
            width: 1287,
            height: 1014,
            zIndex: 53,
            backgroundImage: 'url("/logo.png")',
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center'
          }}
        />

        {/* Logo SVG - maintains original positioning relative to background */}
        <div
          style={{
            position: 'absolute',
            left: 299,
            top: 402,
            width: 294,
            height: 72,
            zIndex: 54,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg 
            width="100%" 
            height="100%" 
            viewBox="0 0 98 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          >
          <path d="M27.415 14.7456C27.415 16.0707 26.1527 16.9612 24.3066 16.9612C22.9516 16.9612 21.9358 16.0707 21.9358 14.9312C21.9358 13.7916 22.9516 12.9303 24.3066 12.9303H27.415V14.7456ZM18.9183 4.09462V7.8181L23.5293 7.80221L29.1207 7.81546V8.30044C28.6476 8.30044 28.2193 8.49123 27.909 8.8013C27.6344 9.07692 27.454 9.44266 27.415 9.85078H23.383C20.2121 9.85078 17.811 12.0372 17.811 14.9921C17.811 17.9179 20.2121 20.1652 23.383 20.1652C24.1126 20.1652 24.7932 20.0566 25.4109 19.8525C26.4106 19.5265 27.2494 18.9514 27.8775 18.1935V19.7942H31.4173V4.09462H18.9183Z" fill="#1B1C42"/>
          <path d="M38.584 5.72205e-06H34.5823V19.7944H41.5303V16.132H38.584V5.72205e-06Z" fill="#1B1C42"/>
          <path d="M46.1537 10.406C46.6776 8.49627 48.2476 7.2337 50.2486 7.2337C52.2183 7.2337 53.8493 8.49627 54.3729 10.406H46.1537ZM58.6825 11.9736C58.6825 7.26553 55.0503 3.72453 50.2486 3.72453C45.445 3.72453 41.813 7.26554 41.813 11.9444C41.813 16.6233 45.445 20.1643 50.2486 20.1643C53.0477 20.1643 55.4474 19.0078 56.9932 17.1618L54.0238 14.8648C53.3731 15.8806 51.9689 16.6233 50.3096 16.6233C48.216 16.6233 46.615 15.3316 46.0927 13.329H58.56C58.6526 12.9603 58.6825 12.3741 58.6825 11.9736Z" fill="#1B1C42"/>
          <path d="M85.2091 10.406C85.733 8.49627 87.3027 7.2337 89.3037 7.2337C91.2737 7.2337 92.9047 8.49627 93.4283 10.406H85.2091ZM97.7377 11.9736C97.7377 7.26553 94.106 3.72453 89.3037 3.72453C84.5004 3.72453 80.8684 7.26554 80.8684 11.9444C80.8684 16.6233 84.5004 20.1643 89.3037 20.1643C92.1031 20.1643 94.5028 19.0078 96.0486 17.1618L93.0792 14.8648C92.4283 15.8806 91.0244 16.6233 89.365 16.6233C87.2714 16.6233 85.6704 15.3316 85.1479 13.329H97.6154C97.708 12.9603 97.7377 12.3741 97.7377 11.9736Z" fill="#1B1C42"/>
          <path d="M64.2961 7.75833V8.24254C65.2421 8.24254 66.0091 9.01035 66.0091 9.95473V16.132H69.14V19.7944H62.0071V7.75833H59.175V4.09585H62.0071V5.72205e-06H66.0091V4.09585H72.9122V7.75833H64.2961Z" fill="#1B1C42"/>
          <path d="M79.5389 16.132V19.7944H72.4063V7.75833H69.574V4.09585H72.4063V5.72205e-06H76.4083V4.09585H80.0277V7.75833H74.6953V8.24254C75.1683 8.24254 75.5966 8.43519 75.9072 8.74552C76.2175 9.05585 76.4083 9.48388 76.4083 9.95473V16.132H79.5389Z" fill="#1B1C42"/>
          <path d="M76.449 4.09461H78.0113L76.449 7.75714V4.09461Z" fill="#1B1C42"/>
          <path d="M79.2812 16.1305H79.5394V19.7941H79.2812V16.1305Z" fill="#1B1C42"/>
          <path d="M12.6196 11.9868C12.6018 14.2156 11.0918 15.9568 8.94299 16.243C8.7384 16.2721 8.52798 16.2854 8.31172 16.2854C6.18973 16.2854 4.52462 14.8914 4.1051 12.9303C4.03646 12.6149 4.00068 12.2863 4.00068 11.9444V9.95678C4.00068 9.90113 3.99326 9.90643 3.98875 9.85077C3.9498 9.4453 3.76958 9.07958 3.49476 8.80396C3.18443 8.49389 2.75616 8.30307 2.2831 8.30307V7.81809H4.00227L7.87471 7.80748L8.4445 7.81809C10.65 7.81809 12.5229 9.5301 12.6167 11.7324C12.6196 11.8039 12.6212 11.8728 12.6212 11.9444C12.6212 11.9577 12.6212 11.9709 12.6196 11.9868ZM16.7411 11.6608C16.6367 7.43647 13.1152 4.09461 8.8876 4.09461H0V24H4.00068V17.7323C4.81402 18.7262 5.85262 19.4656 7.07621 19.8551C7.5445 20.0036 8.04167 20.1042 8.56243 20.144C8.74158 20.1572 8.92497 20.1652 9.11155 20.1652C13.4822 20.1652 16.7456 16.6219 16.7456 11.9444C16.7456 11.849 16.7443 11.7536 16.7411 11.6608Z" fill="#1B1C42"/>
          </svg>
        </div>
      </div>

      {/* Login Pane - Moved to the left */}
      <div
        style={{
          position: 'absolute',
          left: isDesktop ? '63vw' : isMobile ? '50%' : '30%',
          top: '50%',
          width: isDesktop ? '26vw' : isTablet ? '40vw' : '90vw',
          maxWidth: !isMobile ? 'none' : '400px',
          minHeight: isMobile ? 'auto' : '60vh',
          maxHeight: isMobile ? 'calc(100vh - 48px)' : 'calc(100vh - 120px)',
          zIndex: 60,
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
          padding: !isMobile ? '32px' : '24px',
          boxSizing: 'border-box',
          overflow: 'auto',
          fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
          transform: isMobile ? 'translate(-50%, -50%)' : 'translateY(-50%)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: '24px',
              fontWeight: '500',
              color: '#170849',
              margin: '0 0 8px 0',
              lineHeight: '1.4'
            }}
          >
            Welcome to Palette
          </h1>
          {!isLogin && (
            <h2
              style={{
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: '16px',
                fontWeight: '400',
                color: '#181D27',
                margin: '0',
                lineHeight: '1.4'
              }}
            >
              Join Pre-Approved Organization
            </h2>
          )}
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#dc2626',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#166534',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
          {!isLogin && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#181D27',
                  marginBottom: '8px',
                  fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
                }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 16px',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                    backgroundColor: loading ? '#f9fafb' : '#FFFFFF',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#8412FF'}
                  onBlur={(e) => e.target.style.borderColor = '#E9EAEB'}
                />
              </div>
              
              <div style={{ marginBottom: '16px', position: 'relative' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#181D27',
                  marginBottom: '8px',
                  fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
                }}>
                  Select Organization *
                </label>
                <input
                  type="text"
                  value={orgSearchQuery}
                  onChange={handleOrgSearchChange}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#8412FF';
                    handleOrgInputFocus();
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#E9EAEB';
                    handleOrgInputBlur();
                  }}
                  placeholder="Type to search organizations..."
                  required={!formData.selectedOrgId}
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 16px',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                    backgroundColor: loading ? '#f9fafb' : '#FFFFFF',
                    boxSizing: 'border-box',
                    outline: 'none',
                    cursor: loading ? 'not-allowed' : 'text'
                  }}
                />
                
                {/* Dropdown list */}
                {showOrgDropdown && filteredOrganizations.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {filteredOrganizations.map((org) => (
                      <div
                        key={org.company_org_id}
                        onClick={() => handleOrgSelect(org)}
                        style={{
                          padding: '12px 16px',
                          fontSize: '16px',
                          fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                          cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                          backgroundColor: selectedCompanyId === org.company_org_id ? '#f8f9fa' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedCompanyId !== org.company_org_id) {
                            e.currentTarget.style.backgroundColor = '#f8f9fa';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedCompanyId !== org.company_org_id) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        {org.company_name}
                        {org.branches?.length > 1 && (
                          <div style={{
                            marginTop: '4px',
                            fontSize: '12px',
                            color: '#6b7280'
                          }}>
                            {org.branches.length} branches available
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Show "no results" when searching but no matches */}
                {showOrgDropdown && orgSearchQuery.trim() && filteredOrganizations.length === 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E9EAEB',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    zIndex: 1000,
                    padding: '12px 16px',
                    fontSize: '16px',
                    fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                    color: '#666',
                    fontStyle: 'italic'
                  }}>
                    No organizations found
                  </div>
                )}
              </div>
              
              <div style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#1e40af',
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
              }}>
                <strong>Note:</strong> Your email must be pre-approved by an organization administrator to join.
              </div>

              <button
                type="button"
                onClick={() => setShowRequestDialog(true)}
                disabled={loading}
                style={{
                  width: '100%',
                  height: '44px',
                  border: '1px solid #00AAAB',
                  borderRadius: '10px',
                  backgroundColor: 'transparent',
                  color: '#00AAAB',
                  fontSize: '16px',
                  fontWeight: '500',
                  fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: '16px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => !loading && ((e.target as HTMLElement).style.backgroundColor = '#00AAAB', (e.target as HTMLElement).style.color = '#FFFFFF')}
      onMouseLeave={(e) => !loading && ((e.target as HTMLElement).style.backgroundColor = 'transparent', (e.target as HTMLElement).style.color = '#00AAAB')}
              >
                Don't see your organization? Request Access
              </button>
            </>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#181D27',
              marginBottom: '8px',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
            }}>
              Email Address *
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                padding: '0 16px',
                border: '1px solid #E9EAEB',
                borderRadius: '10px',
                fontSize: '16px',
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                backgroundColor: loading ? '#f9fafb' : '#FFFFFF',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#8412FF'}
              onBlur={(e) => e.target.style.borderColor = '#E9EAEB'}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#181D27',
              marginBottom: '8px',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
            }}>
              Password *
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              required
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                padding: '0 16px',
                border: '1px solid #E9EAEB',
                borderRadius: '10px',
                fontSize: '16px',
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                backgroundColor: loading ? '#f9fafb' : '#FFFFFF',
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#8412FF'}
              onBlur={(e) => e.target.style.borderColor = '#E9EAEB'}
            />
          </div>

          {isLogin && (
            <div style={{ textAlign: 'right', marginTop: '-8px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={handleOpenResetDialog}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8412FF',
                  fontSize: '13px',
                  fontWeight: '500',
                  fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                  cursor: 'pointer',
                  textDecoration: 'none',
                  padding: 0
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.textDecoration = 'underline'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.textDecoration = 'none'}
              >
                Forgot password?
              </button>
            </div>
          )}

          {!isLogin && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#181D27',
                marginBottom: '8px',
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
              }}>
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 16px',
                  border: '1px solid #E9EAEB',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                  backgroundColor: loading ? '#f9fafb' : '#FFFFFF',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#8412FF'}
                onBlur={(e) => e.target.style.borderColor = '#E9EAEB'}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '44px',
              border: 'none',
              borderRadius: '10px',
              backgroundColor: loading ? '#ccc' : '#8412FF',
              color: '#FFFFFF',
              fontSize: '16px',
              fontWeight: '500',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '24px',
              marginBottom: '16px',
              transition: 'background-color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => !loading && ((e.target as HTMLElement).style.backgroundColor = '#730ADD')}
            onMouseLeave={(e) => !loading && ((e.target as HTMLElement).style.backgroundColor = '#8412FF')}
          >
            {loading ? (
              <div className="smooth-spinner" style={{ color: '#ffffff' }}>
                <div className="smooth-spinner-ring"></div>
                <div className="smooth-spinner-pulse"></div>
              </div>
            ) : (
              isLogin ? 'Sign In' : 'Join Organization'
            )}
          </button>

          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '14px',
              color: '#181D27',
              margin: '0 0 8px 0',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
            }}>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </p>
            <button
              type="button"
              onClick={toggleMode}
              style={{
                background: 'none',
                border: 'none',
                color: '#8412FF',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
                cursor: 'pointer',
                textDecoration: 'none',
                padding: '4px 0',
                transition: 'text-decoration 0.2s ease'
              }}
              onMouseEnter={(e) => (e.target as HTMLElement).style.textDecoration = 'underline'}
              onMouseLeave={(e) => (e.target as HTMLElement).style.textDecoration = 'none'}
            >
              {isLogin ? 'Sign up here' : 'Sign in here'}
            </button>
          </div>
        </form>
        
        {/* Add spinner animation styles */}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
        </div>
      </div>

      {/* Password Reset Dialog */}
      <Dialog
        open={showResetDialog}
        onClose={handleCloseResetDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reset your password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Enter the email you use for Palette. If it matches an account, we will send instructions to reset your password.
          </Typography>
          {resetError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {resetError}
            </Alert>
          )}
          {resetSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {resetSuccess}
            </Alert>
          )}
          <form onSubmit={handlePasswordResetRequest}>
            <TextField
              fullWidth
              label="Email address"
              type="email"
              value={resetEmail}
              onChange={handleResetEmailChange}
              margin="dense"
              autoFocus
              placeholder="you@example.com"
              inputProps={{ autoComplete: 'email' }}
              disabled={resetLoading}
            />
          </form>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseResetDialog} disabled={resetLoading}>
            Close
          </Button>
          <Button
            onClick={() => handlePasswordResetRequest()}
            variant="contained"
            disabled={resetLoading || resetCooldownRemaining > 0}
          >
            {resetLoading
              ? 'Sending...'
              : resetCooldownRemaining > 0
                ? `Try again in ${resetCooldownRemaining}s`
                : 'Send reset link'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Request Access Dialog */}
      <Dialog 
        open={showRequestDialog} 
        onClose={() => setShowRequestDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Request Organization Access</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Organization Name"
            name="requestOrgName"
            value={formData.requestOrgName}
            onChange={handleInputChange}
            margin="normal"
            required
            placeholder="e.g., Acme Gallery, Smith Museum"
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Justification (Optional)"
            name="justification"
            value={formData.justification}
            onChange={handleInputChange}
            margin="normal"
            multiline
            rows={3}
            placeholder="Why do you need access to this organization?"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRequestDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleRequestAccess}
            variant="contained"
            disabled={loading}
          >
            {loading ? (
              <div className="smooth-spinner" style={{ color: 'inherit' }}>
                <div className="smooth-spinner-ring"></div>
                <div className="smooth-spinner-pulse"></div>
              </div>
            ) : (
              'Submit Request'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AuthPage; 
