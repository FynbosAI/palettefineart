import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationToastHost from '../../../../shared/notifications/NotificationToastHost';
import useNotifications from '../../hooks/useNotifications';
import type { BranchNotificationWithStatus } from '../../../../shared/notifications/types';
import useNotificationNavigation from '../../hooks/useNotificationNavigation';

const NotificationCenter = () => {
  const navigate = useNavigate();
  const { markRead, consumePendingToast, pendingToastCount } = useNotifications();
  const resolveNotificationTarget = useNotificationNavigation();

  const handleSelect = useCallback(
    (notification: BranchNotificationWithStatus) => {
      void markRead(notification.id);
      const target = resolveNotificationTarget(notification);
      if (target) {
        navigate(target);
      }
    },
    [markRead, navigate, resolveNotificationTarget]
  );

  return (
    <div className="notification-layer">
      <NotificationToastHost
        pendingToastCount={pendingToastCount}
        consumeNextToast={consumePendingToast}
        onSelectNotification={handleSelect}
      />
    </div>
  );
};

export default NotificationCenter;
