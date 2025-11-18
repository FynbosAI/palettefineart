import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { DashboardIcon, AccountIcon } from './icons';
import { supabase } from '../lib/supabase';
import useSupabaseStore from '../store/useSupabaseStore';

const Sidebar = () => {
  const navigate = useNavigate();
  type NavLinkConfig = {
    to: string;
    label: React.ReactNode;
    icon: React.ComponentType<any>;
    iconSize?: string;
    isCustomIcon?: boolean;
    comingSoon?: boolean;
    disabled?: boolean;
  };

  const navLinks: NavLinkConfig[] = [
    { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, iconSize: 'icon-dashboard-20', isCustomIcon: true },
    {
      to: '/logistics',
      label: (
        <span style={{ textAlign: 'center', lineHeight: '1.1' }}>
          Shipments<br />&amp; Estimates
        </span>
      ),
      icon: LocalShippingOutlinedIcon,
      iconSize: 'icon-24',
    },
    { to: '/messages', label: 'Messages', icon: MessageOutlinedIcon, iconSize: 'icon-24' },
    { to: '/insurance', label: 'Insurance', icon: SecurityOutlinedIcon, iconSize: 'icon-24', comingSoon: true, disabled: true },
  ];

  const getIconColor = (options: { disabled?: boolean }) => {
    if (options.disabled) return '#B0ACBE';
    return '#170849';
  };

  const renderButtonContent = (
    config: Pick<NavLinkConfig, 'icon' | 'iconSize' | 'isCustomIcon' | 'label' | 'comingSoon'>,
    iconColor: string
  ) => (
    <>
      {config.isCustomIcon ? (
        <config.icon
          className={config.iconSize || 'icon-24'}
          fill={iconColor}
        />
      ) : (
        <config.icon
          className={config.iconSize || 'icon-24'}
          sx={{ color: iconColor }}
        />
      )}
      <div className="sidebar-btn-text">
        <span className="sidebar-btn-label">{config.label}</span>
        {config.comingSoon && (
          <span className="coming-soon-label">Coming Soon</span>
        )}
      </div>
    </>
  );

  const [highlightStyle, setHighlightStyle] = useState({ top: 0, opacity: 0 });
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const handleLogout = async () => {
    try {
      const { memberships = [] } = useSupabaseStore.getState();
      const hasPartnerOrg = memberships.some((membership: any) => (membership as any)?.organization?.type === 'partner');
      const shipperUrl = (import.meta as any).env?.VITE_SHIPPER_APP_URL as string | undefined;

      // Fire-and-forget global signOut and cross-app bounce
      const signOutPromise = supabase.auth.signOut({ scope: 'global' as any });
      signOutPromise
        .then(() => console.log('✅ Sign-out request complete'))
        .catch(err => console.error('❌ Sign-out error:', err));

      // Clear store immediately
      useSupabaseStore.getState().clearStore();
      console.log('🧹 Store cleared');
      // Force clear local/session storage tokens
      try {
        Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) localStorage.removeItem(k); });
        Object.keys(sessionStorage).forEach(k => { if (k.startsWith('sb-') || k.includes('supabase')) sessionStorage.removeItem(k); });
        sessionStorage.removeItem('palette:postAuthRedirect');
      } catch {}

      if (!hasPartnerOrg || !shipperUrl) {
        navigate('/auth', { state: { loggedOut: true }, replace: true });
        console.log('🔄 Navigated to auth page');
        return;
      }

      const target = `${shipperUrl}/auth?logout=1`;
      console.log('🔁 Bouncing to Shipper to clear session:', target);
      window.location.replace(target);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  useEffect(() => {
    if (menuContainerRef.current) {
      const activeButton = menuContainerRef.current.querySelector('.sidebar-btn.active') as HTMLElement;
      if (activeButton) {
        setHighlightStyle({
          top: activeButton.offsetTop,
          opacity: 1,
        });
      } else {
        setHighlightStyle(s => ({ ...s, opacity: 0 }));
      }
    }
  }, [location]);

  return (
    <aside className="sidebar">
      <div className="menu-container" ref={menuContainerRef}>
        <div className="sidebar-highlight" style={highlightStyle} />
        <div className="top-menu">
          <div className="logo">
            <img src="/logo.png" alt="Palette Logo" />
          </div>
          {navLinks.map((link) => {
            const baseClasses = ['sidebar-btn'];
            if (link.comingSoon) baseClasses.push('coming-soon');
            if (link.disabled) baseClasses.push('disabled');

            const iconColor = getIconColor({ disabled: link.disabled });
            const content = renderButtonContent(link, iconColor);

            if (link.disabled) {
              return (
                <div
                  key={link.to}
                  className={baseClasses.join(' ')}
                  role="link"
                  aria-disabled="true"
                >
                  {content}
                </div>
              );
            }

            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => {
                  const classes = [...baseClasses];
                  if (isActive) classes.push('active');
                  return classes.join(' ');
                }}
                end
              >
                {content}
              </NavLink>
            );
          })}
        </div>
        <div className="bottom-menu">
          <NavLink
            to="/account"
            className={({ isActive }) => (isActive ? 'sidebar-btn active' : 'sidebar-btn')}
          >
            {renderButtonContent({
              icon: AccountIcon,
              iconSize: 'icon-18',
              isCustomIcon: true,
              label: 'My Palette',
            }, '#170849')}
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-btn logout-btn"
          >
            <LogoutOutlinedIcon
              sx={{ color: '#170849' }}
              className="icon-24"
            />
            <div className="sidebar-btn-text">
              <span className="sidebar-btn-label">Logout</span>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar; 
