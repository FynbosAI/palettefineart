import React from 'react';
import { Box, Paper, Typography, Alert } from '@mui/material';
import useSupabaseStore from '../store/useSupabaseStore';

const DiagnosticInfo: React.FC = () => {
  const { 
    user, 
    profile, 
    currentOrg, 
    memberships, 
    loading, 
    error 
  } = useSupabaseStore();

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          🔍 Diagnostic Information
        </Typography>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          This diagnostic panel shows the current authentication state. Check the browser console for detailed logs.
        </Alert>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="primary">
            User State:
          </Typography>
          <Typography variant="body2" sx={{ ml: 2 }}>
            {user ? `✅ Logged in as: ${user.email}` : '❌ Not logged in'}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="primary">
            Profile State:
          </Typography>
          <Typography variant="body2" sx={{ ml: 2 }}>
            {profile ? (
              <>
                ✅ Profile loaded: {profile.full_name}<br/>
                Default Org: {profile.default_org || 'None set'}
              </>
            ) : '❌ No profile loaded'}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="primary">
            Memberships State:
          </Typography>
          <Typography variant="body2" sx={{ ml: 2 }}>
            {memberships.length > 0 ? (
              <>
                ✅ {memberships.length} membership(s) found:<br/>
                {memberships.map((m, i) => (
                  <span key={i}>
                    • {(m as any).organization?.name || 'Unknown'} ({m.role})<br/>
                  </span>
                ))}
              </>
            ) : '❌ No memberships found'}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="primary">
            Current Organization:
          </Typography>
          <Typography variant="body2" sx={{ ml: 2 }}>
            {currentOrg ? `✅ ${(currentOrg.company?.name || currentOrg.name)}${currentOrg.branch_name ? ` · ${currentOrg.branch_name}` : ''}` : '❌ No organization selected'}
          </Typography>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="primary">
            Loading State:
          </Typography>
          <Typography variant="body2" sx={{ ml: 2 }}>
            {loading ? '⏳ Loading...' : '✅ Not loading'}
          </Typography>
        </Box>

        {error && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="error">
              Error State:
            </Typography>
            <Typography variant="body2" sx={{ ml: 2, color: 'error.main' }}>
              ❌ {error}
            </Typography>
          </Box>
        )}

        <Alert severity="warning" sx={{ mt: 2 }}>
          <strong>Common Issues:</strong><br/>
          1. User has no organization memberships<br/>
          2. Database tables not created<br/>
          3. RLS policies blocking access<br/>
          4. Environment variables not set
        </Alert>
      </Paper>
    </Box>
  );
};

export default DiagnosticInfo; 
