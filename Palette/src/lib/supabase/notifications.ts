import { supabase } from './client';
import { createSupabaseNotificationService } from '../../../../shared/notifications/supabaseService';

export const notificationsService = createSupabaseNotificationService(supabase);

export default notificationsService;
