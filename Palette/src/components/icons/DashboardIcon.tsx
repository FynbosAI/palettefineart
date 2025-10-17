import React from 'react';

interface DashboardIconProps {
  className?: string;
  style?: React.CSSProperties;
  fill?: string;
}

const DashboardIcon: React.FC<DashboardIconProps> = ({ 
  className = '', 
  style = {},
  fill = '#170849'
}) => {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 20 20" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <path 
        fillRule="evenodd" 
        clipRule="evenodd" 
        d="M0 0H8.88889V11.1111H0V0ZM20 0H11.1111V6.66667H20V0ZM6.66663 8.88885V2.22219H2.22219V8.88885H6.66663ZM17.7778 4.44441V2.22219H13.3333V4.44441H17.7778ZM17.7778 11.1111V17.7778H13.3333V11.1111H17.7778ZM6.66663 17.7777V15.5555H2.22219V17.7777H6.66663ZM20 8.88885H11.1111V20H20V8.88885ZM0 13.3333H8.88889V20H0V13.3333Z" 
        fill={fill}
      />
    </svg>
  );
};

export default DashboardIcon;