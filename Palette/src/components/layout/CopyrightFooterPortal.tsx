import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import CopyrightFooter from '../../../../shared/ui/CopyrightFooter';

const useMainPanelFooterHost = () => {
  const location = useLocation();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    let cancelled = false;

    const resolveHost = () => {
      if (cancelled) return;
      const mainPanel = document.querySelector<HTMLElement>('.dashboard .main-panel');
      if (!mainPanel) {
        frame = requestAnimationFrame(resolveHost);
        return;
      }

      const mountNode = document.createElement('div');
      mountNode.classList.add('copyright-footer-host');
      mainPanel.appendChild(mountNode);
      hostRef.current = mountNode;
      setHost(mountNode);
    };

    resolveHost();

    return () => {
      cancelled = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (hostRef.current) {
        hostRef.current.remove();
        hostRef.current = null;
      }
      setHost(null);
    };
  }, [location.pathname]);

  return host;
};

const CopyrightFooterPortal = () => {
  const host = useMainPanelFooterHost();

  if (!host) {
    return null;
  }

  return createPortal(<CopyrightFooter variant="gallery" />, host);
};

export default CopyrightFooterPortal;
