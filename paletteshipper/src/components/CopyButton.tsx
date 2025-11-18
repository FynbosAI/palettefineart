import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface CopyButtonProps {
  text: string;
  size?: 'small' | 'medium';
  className?: string;
}

const CopyButton: React.FC<CopyButtonProps> = ({ text, size = 'small', className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const buttonSize = size === 'small' ? {
    height: '32px',
    padding: '6px 12px',
    fontSize: '12px',
    iconSize: '14px'
  } : {
    height: '36px',
    padding: '8px 16px',
    fontSize: '13px',
    iconSize: '16px'
  };

  return (
    <motion.button
      className={`copy-btn ${className}`}
      onClick={handleCopy}
      disabled={copied}
      whileHover={{ scale: copied ? 1 : 1.005 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.15 }}
      style={{
        height: buttonSize.height,
        padding: buttonSize.padding,
        borderRadius: '10px',
        border: copied ? '1px solid #0DAB71' : '1px solid #E9EAEB',
        background: copied ? 'rgba(13, 171, 113, 0.1)' : '#FFFFFF',
        color: copied ? '#0DAB71' : '#58517E',
        cursor: copied ? 'default' : 'pointer',
        fontSize: buttonSize.fontSize,
        fontWeight: 500,
        fontFamily: 'Fractul, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'all 0.2s ease',
        letterSpacing: '0.1px',
        outline: 'none',
        boxShadow: copied 
          ? '0 2px 8px rgba(13, 171, 113, 0.15)' 
          : '0 1px 3px rgba(0, 0, 0, 0.05)',
        minWidth: size === 'small' ? '70px' : '80px',
        justifyContent: 'center'
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background = 'rgba(132, 18, 255, 0.05)';
          e.currentTarget.style.borderColor = '#8412FF';
          e.currentTarget.style.color = '#8412FF';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(132, 18, 255, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background = '#FFFFFF';
          e.currentTarget.style.borderColor = '#E9EAEB';
          e.currentTarget.style.color = '#58517E';
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
        }
      }}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="check"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <CheckIcon sx={{ fontSize: buttonSize.iconSize }} />
            <span>Copied!</span>
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ContentCopyIcon sx={{ fontSize: buttonSize.iconSize }} />
            <span>Copy</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

export default CopyButton;

