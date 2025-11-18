import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import CopyrightFooter from '../../../../shared/ui/CopyrightFooter';
import { useBranchNetwork } from '../../hooks/useStoreSelectors';

const useMainPanelFooterHost = (suppress: boolean) => {
  const location = useLocation();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (suppress) {
      if (hostRef.current) {
        hostRef.current.remove();
        hostRef.current = null;
      }
      setHost(null);
      return;
    }

    let frame: number | null = null;
    let cancelled = false;

    const resolveHost = () => {
      if (cancelled) return;
      const mainPanel = document.querySelector<HTMLElement>('.dashboard .main-panel:not(.main-panel--suppress-footer)');
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
  }, [location.pathname, suppress]);

  return host;
};

const CopyrightFooterPortal = () => {
  const location = useLocation();
  const { branchNetwork, branchNetworkLoading, branchNetworkError } = useBranchNetwork();

  const isNetworkRoute = location.pathname.startsWith('/network');
  const delayForNetwork = Boolean(
    isNetworkRoute &&
    ((branchNetworkLoading && branchNetwork.length === 0) ||
      (branchNetworkError && branchNetwork.length === 0))
  );

  const host = useMainPanelFooterHost(delayForNetwork);

  if (!host) {
    return null;
  }

  return createPortal(<CopyrightFooter variant="shipper" />, host);
};

export default CopyrightFooterPortal;
