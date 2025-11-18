import { supabase } from '../supabase';
import { createSupabaseNotificationService } from '../../../../shared/notifications/supabaseService';

export const notificationsService = createSupabaseNotificationService(supabase);

export default notificationsService;
