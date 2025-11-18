import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import useShipperStore from '../store/useShipperStore';
import { DashboardIcon, AccountIcon } from './icons';

const Sidebar = () => {
  const navigate = useNavigate();
  const signOut = useShipperStore((state) => state.signOut);
  const authLoading = useShipperStore((state) => state.authLoading);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  type NavLinkConfig = {
    to: string;
    label: React.ReactNode;
    icon: React.ComponentType<any>;
    iconClass?: string;
    isCustomIcon?: boolean;
    comingSoon?: boolean;
    disabled?: boolean;
  };

  const navLinks: NavLinkConfig[] = [
    { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon, iconClass: 'icon-dashboard-20', isCustomIcon: true },
    { to: '/shipments', label: 'Shipments', icon: LocalShippingOutlinedIcon, iconClass: 'icon-24' },
    { to: '/estimates', label: 'Estimates', icon: RequestQuoteOutlinedIcon, iconClass: 'icon-24' },
    { to: '/network', label: 'Network', icon: PublicOutlinedIcon, iconClass: 'icon-24' },
    { to: '/messages', label: 'Messages', icon: MessageOutlinedIcon, iconClass: 'icon-24' },
    { to: '/insurance', label: 'Insurance', icon: SecurityOutlinedIcon, iconClass: 'icon-24', comingSoon: true, disabled: true },
  ];

  const getIconColor = (options: { disabled?: boolean } = {}) => {
    if (options.disabled) return 'rgba(232, 219, 248, 0.6)';
    return '#e8dbf8';
  };

  const renderButtonContent = (
    config: Pick<NavLinkConfig, 'icon' | 'iconClass' | 'isCustomIcon' | 'label' | 'comingSoon'>,
    iconColor: string
  ) => (
    <>
      {config.isCustomIcon ? (
        <config.icon className={config.iconClass || 'icon-24'} fill={iconColor} />
      ) : (
        <config.icon className={config.iconClass || 'icon-24'} sx={{ color: iconColor }} />
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

  const handleLogout = async () => {
    if (isLoggingOut || authLoading) return; // Prevent multiple clicks
    
    setIsLoggingOut(true);
    console.log('🚪 Logout initiated');
    
    try {
      // Use a timeout to ensure we don't hang forever (matches AuthService timeout)
      await Promise.race([
        signOut(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Logout timeout after 4 seconds')), 4000)
        )
      ]);
      
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
    
    // Always redirect; perform cross-app logout bounce so Gallery clears session too
    console.log('🔄 Redirecting to auth page');
    setIsLoggingOut(false);
    const galleryUrl = (import.meta as any).env?.VITE_GALLERY_APP_URL as string | undefined;
    if (galleryUrl) {
      const target = `${galleryUrl}/auth?logout=1`;
      window.location.replace(target);
      return;
    }
    navigate('/auth', { state: { loggedOut: true }, replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="menu-container" ref={menuContainerRef}>
        <div className="sidebar-highlight" style={highlightStyle} />
        <div className="top-menu">
          <div className="logo">
            <img src="/Logo_pink.png" alt="Palette Logo" />
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
            to="/profile"
            className={({ isActive }) => (isActive ? 'sidebar-btn active' : 'sidebar-btn')}
          >
            {renderButtonContent({
              icon: AccountIcon,
              iconClass: 'icon-18',
              isCustomIcon: true,
              label: 'My Palette',
            }, getIconColor())}
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut || authLoading}
            className="sidebar-btn logout-btn"
            aria-busy={isLoggingOut || authLoading}
          >
            {(isLoggingOut || authLoading) ? (
              <div className="sidebar-spinner" />
            ) : (
              <LogoutOutlinedIcon sx={{ color: '#e8dbf8' }} className="icon-24" />
            )}
            <div className="sidebar-btn-text">
              <span className="sidebar-btn-label">{(isLoggingOut || authLoading) ? 'Signing out...' : 'Logout'}</span>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar; 
