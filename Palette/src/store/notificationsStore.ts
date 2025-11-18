import { createNotificationStore } from '../../../shared/notifications/createNotificationStore';
import notificationsService from '../lib/supabase/notifications';

const useNotificationsStore = createNotificationStore({
  service: notificationsService,
});

export default useNotificationsStore;
