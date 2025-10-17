import React from 'react';
import { TextField } from '@mui/material';
import { Note as NotesIcon } from '@mui/icons-material';

interface NotesFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

const NotesField: React.FC<NotesFieldProps> = ({
  value,
  onChange,
  placeholder = "Add any special instructions, requirements, or notes for this estimate...",
  label = "Additional Notes",
  disabled = false
}) => {
  return (
    <div style={{ width: '100%' }}>
      {/* Header with icon and label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '12px'
      }}>
        <NotesIcon sx={{ 
          width: '20px', 
          height: '20px', 
          color: '#8412FF' 
        }} />
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 500,
          color: '#170849',
          fontFamily: 'Fractul, Helvetica Neue, Arial, sans-serif'
        }}>
          {label}
        </h3>
      </div>

      {/* Text area */}
      <TextField
        multiline
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        variant="outlined"
        fullWidth
        sx={{
          '& .MuiOutlinedInput-root': {
            fontFamily: 'Fractul, Helvetica Neue, Arial, sans-serif',
            fontSize: '14px',
            lineHeight: '1.4',
            borderRadius: '10px',
            backgroundColor: '#ffffff',
            transition: 'all 0.2s ease-in-out',
            '& fieldset': {
              borderColor: '#E9EAEB',
              borderWidth: '1px'
            },
            '&:hover fieldset': {
              borderColor: '#B587E8',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#8412FF',
              borderWidth: '2px'
            },
            '&.Mui-disabled': {
              backgroundColor: 'rgba(224, 222, 226, 0.1)',
            }
          },
          '& .MuiOutlinedInput-input': {
            padding: '16px',
            color: '#181D27',
            '&::placeholder': {
              color: 'rgba(23, 8, 73, 0.6)',
              opacity: 1
            }
          },
          '& .MuiOutlinedInput-input.Mui-disabled': {
            WebkitTextFillColor: 'rgba(23, 8, 73, 0.6)',
          }
        }}
      />

      {/* Character count indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '8px'
      }}>
        <span style={{
          fontSize: '12px',
          color: 'rgba(23, 8, 73, 0.6)',
          fontFamily: 'Fractul, Helvetica Neue, Arial, sans-serif'
        }}>
          {value.length} characters
        </span>
      </div>
    </div>
  );
};

export default NotesField;