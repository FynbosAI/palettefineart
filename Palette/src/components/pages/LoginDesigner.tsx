import React, { useState, useRef, useCallback } from 'react';

interface DraggableElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

const LoginDesigner: React.FC = () => {
  const [softSelectMode, setSoftSelectMode] = useState(false);
  const [elements, setElements] = useState<Record<string, DraggableElement>>({
    logoPng: {
      id: 'logoPng',
      x: -187,
      y: 37,
      width: 1287,
      height: 1014,
      zIndex: 53
    },
    logoSvg: {
      id: 'logoSvg',
      x: 299,
      y: 402,
      width: 294,
      height: 72,
      zIndex: 54
    },
    loginPane: {
      id: 'loginPane',
      x: 1194,
      y: 261,
      width: 418,
      height: 520,
      zIndex: 57
    }
  });

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    elementId: string | null;
    startX: number;
    startY: number;
    startElementX: number;
    startElementY: number;
  }>({
    isDragging: false,
    elementId: null,
    startX: 0,
    startY: 0,
    startElementX: 0,
    startElementY: 0
  });

  const [resizeState, setResizeState] = useState<{
    isResizing: boolean;
    elementId: string | null;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  }>({
    isResizing: false,
    elementId: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, elementId: string, action: 'drag' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();

    const element = elements[elementId];
    if (!element) return;

    // In soft select mode, just bring to front without dragging
    if (softSelectMode && action === 'drag') {
      setElements(prev => ({
        ...prev,
        [elementId]: {
          ...prev[elementId],
          zIndex: Math.max(...Object.values(prev).map(el => el.zIndex)) + 1
        }
      }));
      return;
    }

    // Always bring element to front immediately on mouse down
    setElements(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        zIndex: Math.max(...Object.values(prev).map(el => el.zIndex)) + 1
      }
    }));

    if (action === 'drag') {
      setDragState({
        isDragging: true,
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        startElementX: element.x,
        startElementY: element.y
      });
    } else if (action === 'resize') {
      setResizeState({
        isResizing: true,
        elementId,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: element.width,
        startHeight: element.height
      });
    }
  }, [elements, softSelectMode]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState.isDragging && dragState.elementId) {
      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      
      setElements(prev => ({
        ...prev,
        [dragState.elementId!]: {
          ...prev[dragState.elementId!],
          x: dragState.startElementX + deltaX,
          y: dragState.startElementY + deltaY
        }
      }));
    }

    if (resizeState.isResizing && resizeState.elementId) {
      const deltaX = e.clientX - resizeState.startX;
      const deltaY = e.clientY - resizeState.startY;
      
      setElements(prev => ({
        ...prev,
        [resizeState.elementId!]: {
          ...prev[resizeState.elementId!],
          width: Math.max(50, resizeState.startWidth + deltaX),
          height: Math.max(50, resizeState.startHeight + deltaY)
        }
      }));
    }
  }, [dragState, resizeState]);

  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      elementId: null,
      startX: 0,
      startY: 0,
      startElementX: 0,
      startElementY: 0
    });
    setResizeState({
      isResizing: false,
      elementId: null,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0
    });
  }, []);

  React.useEffect(() => {
    if (dragState.isDragging || resizeState.isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, resizeState.isResizing, handleMouseMove, handleMouseUp]);

  const exportPositioning = () => {
    const positioning = Object.values(elements).reduce((acc, element) => {
      acc[element.id] = {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex
      };
      return acc;
    }, {} as Record<string, Omit<DraggableElement, 'id'>>);

    console.log('🎨 Login Layout Positioning:', JSON.stringify(positioning, null, 2));
    
    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(positioning, null, 2));
    alert('Positioning data copied to clipboard and logged to console!');
  };

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: '100vh',
        backgroundColor: '#EAD9F9', // Brand lavender background
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      {/* Controls */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        gap: '12px'
      }}>
        <button
          onClick={exportPositioning}
          style={{
            padding: '8px 16px',
            backgroundColor: '#8412FF',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          📋 Export Positioning
        </button>
        
        <button
          onClick={() => setSoftSelectMode(!softSelectMode)}
          style={{
            padding: '8px 16px',
            backgroundColor: softSelectMode ? '#00AAAB' : '#E9EAEB',
            color: softSelectMode ? 'white' : '#181D27',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {softSelectMode ? '🎯 Soft Select ON' : '🎯 Soft Select OFF'}
        </button>
      </div>

      {/* Logo PNG */}
      <div
        style={{
          position: 'absolute',
          left: elements.logoPng.x,
          top: elements.logoPng.y,
          width: elements.logoPng.width,
          height: elements.logoPng.height,
          zIndex: elements.logoPng.zIndex,
          border: '2px dashed rgba(132, 18, 255, 0.5)',
          cursor: 'move',
          backgroundImage: 'url("/logo.png")',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          pointerEvents: 'auto'
        }}
        onMouseDown={(e) => handleMouseDown(e, 'logoPng', 'drag')}
      >
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          background: 'rgba(132, 18, 255, 0.8)',
          color: 'white',
          padding: '2px 6px',
          fontSize: '10px',
          borderRadius: '4px',
          fontWeight: '500'
        }}>
          Logo PNG
        </div>
        
        {/* Resize handle */}
        <div
          style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            width: '12px',
            height: '12px',
            backgroundColor: '#8412FF',
            cursor: 'se-resize',
            borderRadius: '2px',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => handleMouseDown(e, 'logoPng', 'resize')}
        />
      </div>

      {/* Logo SVG */}
      <div
        style={{
          position: 'absolute',
          left: elements.logoSvg.x,
          top: elements.logoSvg.y,
          width: elements.logoSvg.width,
          height: elements.logoSvg.height,
          zIndex: elements.logoSvg.zIndex,
          border: '2px dashed rgba(132, 18, 255, 0.5)',
          cursor: 'move',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}
        onMouseDown={(e) => handleMouseDown(e, 'logoSvg', 'drag')}
      >
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          background: 'rgba(132, 18, 255, 0.8)',
          color: 'white',
          padding: '2px 6px',
          fontSize: '10px',
          borderRadius: '4px',
          fontWeight: '500'
        }}>
          Logo SVG
        </div>

        <svg 
          width="100%" 
          height="100%" 
          viewBox="0 0 98 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          <path d="M27.415 14.7456C27.415 16.0707 26.1527 16.9612 24.3066 16.9612C22.9516 16.9612 21.9358 16.0707 21.9358 14.9312C21.9358 13.7916 22.9516 12.9303 24.3066 12.9303H27.415V14.7456ZM18.9183 4.09462V7.8181L23.5293 7.80221L29.1207 7.81546V8.30044C28.6476 8.30044 28.2193 8.49123 27.909 8.8013C27.6344 9.07692 27.454 9.44266 27.415 9.85078H23.383C20.2121 9.85078 17.811 12.0372 17.811 14.9921C17.811 17.9179 20.2121 20.1652 23.383 20.1652C24.1126 20.1652 24.7932 20.0566 25.4109 19.8525C26.4106 19.5265 27.2494 18.9514 27.8775 18.1935V19.7942H31.4173V4.09462H18.9183Z" fill="#1B1C42"/>
          <path d="M38.584 5.72205e-06H34.5823V19.7944H41.5303V16.132H38.584V5.72205e-06Z" fill="#1B1C42"/>
          <path d="M46.1537 10.406C46.6776 8.49627 48.2476 7.2337 50.2486 7.2337C52.2183 7.2337 53.8493 8.49627 54.3729 10.406H46.1537ZM58.6825 11.9736C58.6825 7.26553 55.0503 3.72453 50.2486 3.72453C45.445 3.72453 41.813 7.26554 41.813 11.9444C41.813 16.6233 45.445 20.1643 50.2486 20.1643C53.0477 20.1643 55.4474 19.0078 56.9932 17.1618L54.0238 14.8648C53.3731 15.8806 51.9689 16.6233 50.3096 16.6233C48.216 16.6233 46.615 15.3316 46.0927 13.329H58.56C58.6526 12.9603 58.6825 12.3741 58.6825 11.9736Z" fill="#1B1C42"/>
          <path d="M85.2091 10.406C85.733 8.49627 87.3027 7.2337 89.3037 7.2337C91.2737 7.2337 92.9047 8.49627 93.4283 10.406H85.2091ZM97.7377 11.9736C97.7377 7.26553 94.106 3.72453 89.3037 3.72453C84.5004 3.72453 80.8684 7.26554 80.8684 11.9444C80.8684 16.6233 84.5004 20.1643 89.3037 20.1643C92.1031 20.1643 94.5028 19.0078 96.0486 17.1618L93.0792 14.8648C92.4283 15.8806 91.0244 16.6233 89.365 16.6233C87.2714 16.6233 85.6704 15.3316 85.1479 13.329H97.6154C97.708 12.9603 97.7377 12.3741 97.7377 11.9736Z" fill="#1B1C42"/>
          <path d="M64.2961 7.75833V8.24254C65.2421 8.24254 66.0091 9.01035 66.0091 9.95473V16.132H69.14V19.7944H62.0071V7.75833H59.175V4.09585H62.0071V5.72205e-06H66.0091V4.09585H72.9122V7.75833H64.2961Z" fill="#1B1C42"/>
          <path d="M79.5389 16.132V19.7944H72.4063V7.75833H69.574V4.09585H72.4063V5.72205e-06H76.4083V4.09585H80.0277V7.75833H74.6953V8.24254C75.1683 8.24254 75.5966 8.43519 75.9072 8.74552C76.2175 9.05585 76.4083 9.48388 76.4083 9.95473V16.132H79.5389Z" fill="#1B1C42"/>
          <path d="M76.449 4.09461H78.0113L76.449 7.75714V4.09461Z" fill="#1B1C42"/>
          <path d="M79.2812 16.1305H79.5394V19.7941H79.2812V16.1305Z" fill="#1B1C42"/>
          <path d="M12.6196 11.9868C12.6018 14.2156 11.0918 15.9568 8.94299 16.243C8.7384 16.2721 8.52798 16.2854 8.31172 16.2854C6.18973 16.2854 4.52462 14.8914 4.1051 12.9303C4.03646 12.6149 4.00068 12.2863 4.00068 11.9444V9.95678C4.00068 9.90113 3.99326 9.90643 3.98875 9.85077C3.9498 9.4453 3.76958 9.07958 3.49476 8.80396C3.18443 8.49389 2.75616 8.30307 2.2831 8.30307V7.81809H4.00227L7.87471 7.80748L8.4445 7.81809C10.65 7.81809 12.5229 9.5301 12.6167 11.7324C12.6196 11.8039 12.6212 11.8728 12.6212 11.9444C12.6212 11.9577 12.6212 11.9709 12.6196 11.9868ZM16.7411 11.6608C16.6367 7.43647 13.1152 4.09461 8.8876 4.09461H0V24H4.00068V17.7323C4.81402 18.7262 5.85262 19.4656 7.07621 19.8551C7.5445 20.0036 8.04167 20.1042 8.56243 20.144C8.74158 20.1572 8.92497 20.1652 9.11155 20.1652C13.4822 20.1652 16.7456 16.6219 16.7456 11.9444C16.7456 11.849 16.7443 11.7536 16.7411 11.6608Z" fill="#1B1C42"/>
        </svg>
        
        {/* Resize handle */}
        <div
          style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            width: '12px',
            height: '12px',
            backgroundColor: '#8412FF',
            cursor: 'se-resize',
            borderRadius: '2px',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => handleMouseDown(e, 'logoSvg', 'resize')}
        />
      </div>

      {/* Login Pane */}
      <div
        style={{
          position: 'absolute',
          left: elements.loginPane.x,
          top: elements.loginPane.y,
          width: elements.loginPane.width,
          height: elements.loginPane.height,
          zIndex: elements.loginPane.zIndex,
          border: '2px dashed rgba(132, 18, 255, 0.5)',
          cursor: 'move',
          backgroundColor: '#FFFFFF',
          borderRadius: '10px',
          boxShadow: '0 0 40px rgba(10, 13, 18, 0.12)',
          padding: '32px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          pointerEvents: 'auto'
        }}
        onMouseDown={(e) => handleMouseDown(e, 'loginPane', 'drag')}
      >
        <div style={{
          position: 'absolute',
          top: '4px',
          left: '4px',
          background: 'rgba(132, 18, 255, 0.8)',
          color: 'white',
          padding: '2px 6px',
          fontSize: '10px',
          borderRadius: '4px',
          fontWeight: '500'
        }}>
          Login Pane
        </div>

        {/* Login Form Content */}
        <div style={{ textAlign: 'center', marginBottom: '24px', marginTop: '20px' }}>
          <h1 style={{
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: '20px',
            fontWeight: '500',
            color: '#170849',
            margin: '0 0 8px 0'
          }}>
            Welcome to Palette
          </h1>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: '500',
            color: '#181D27',
            marginBottom: '6px',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
          }}>
            Email Address *
          </label>
          <input
            type="email"
            style={{
              width: '100%',
              height: '36px',
              padding: '0 12px',
              border: '1px solid #E9EAEB',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
              boxSizing: 'border-box'
            }}
            placeholder="Enter your email"
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: '500',
            color: '#181D27',
            marginBottom: '6px',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif"
          }}>
            Password *
          </label>
          <input
            type="password"
            style={{
              width: '100%',
              height: '36px',
              padding: '0 12px',
              border: '1px solid #E9EAEB',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
              boxSizing: 'border-box'
            }}
            placeholder="Enter your password"
          />
        </div>

        <button
          style={{
            width: '100%',
            height: '40px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#8412FF',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
            cursor: 'pointer'
          }}
        >
          Sign In
        </button>

        {/* Resize handle */}
        <div
          style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            width: '12px',
            height: '12px',
            backgroundColor: '#8412FF',
            cursor: 'se-resize',
            borderRadius: '2px',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => handleMouseDown(e, 'loginPane', 'resize')}
        />
      </div>

      {/* Instructions */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: '16px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: "'Fractul', -apple-system, BlinkMacSystemFont, sans-serif",
        maxWidth: '300px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
        <strong>🎨 Design Mode</strong><br/>
        • Drag elements to move them<br/>
        • Drag bottom-right corner to resize<br/>
        • Logo PNG can be pushed out of frame<br/>
        • <strong>Soft Select Mode:</strong> Click to bring to front without dragging<br/>
        • SVG Logo & Login Pane always accessible (higher z-index)<br/>
        • Click "Export Positioning" when ready
      </div>
    </div>
  );
};

export default LoginDesigner;
