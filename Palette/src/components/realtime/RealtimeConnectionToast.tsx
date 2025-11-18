import { useEffect, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';
import useSupabaseStore from '../../store/useSupabaseStore';

const RealtimeConnectionToast = () => {
  const toast = useSupabaseStore((state) => state.realtime.toast);
  const clearToast = useSupabaseStore((state) => state.clearRealtimeToast);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (toast) {
      setOpen(true);
      if (toast.type === 'reconnected') {
        const timer = setTimeout(() => {
          setOpen(false);
          clearToast();
        }, 3000);
        return () => clearTimeout(timer);
      }
    } else {
      setOpen(false);
    }
    return undefined;
  }, [toast, clearToast]);

  const handleClose = (_event?: unknown, reason?: string) => {
    if (reason === 'clickaway' && toast?.type === 'reconnecting') {
      return;
    }
    setOpen(false);
    clearToast();
  };

  if (!toast) {
    return null;
  }

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      autoHideDuration={toast.type === 'reconnecting' ? undefined : 4000}
    >
      <Alert
        severity={toast.type === 'reconnecting' ? 'warning' : 'success'}
        variant="filled"
        onClose={toast.type === 'reconnecting' ? undefined : handleClose}
        sx={{ fontWeight: 500, alignItems: 'center' }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );
};

export default RealtimeConnectionToast;
