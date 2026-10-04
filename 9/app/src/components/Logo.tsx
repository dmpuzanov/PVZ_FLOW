import React from 'react';

interface LogoProps {
  variant?: 'default' | 'white' | 'print';
  size?: 'sm' | 'md' | 'lg' | 'print';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'default',
  size = 'md',
  showText = true,
  className = '',
}) => {
  const color = variant === 'white' ? '#FFFFFF' : '#5A081E';

  // Sizing mapping
  // In print, specification requires at least 15mm (~57px) height
  const dimensions = {
    sm: { height: 28, width: showText ? 120 : 45 },
    md: { height: 38, width: showText ? 160 : 60 },
    lg: { height: 48, width: showText ? 200 : 75 },
    print: { height: 60, width: showText ? 220 : 80 },
  }[size];

  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={{ height: dimensions.height }}
      aria-label="PVZ.FLOW Logo"
    >
      <svg
        viewBox="0 0 240 120"
        height={dimensions.height}
        style={{ height: `${dimensions.height}px`, width: 'auto' }}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        {/* Two intersecting hexagons */}
        <g stroke={color} strokeWidth="4.5" strokeLinejoin="round" fill="none">
          {/* Left hexagon */}
          <polygon points="60,12 108,36 108,84 60,108 12,84 12,36" />
          {/* Right hexagon (shifted) */}
          <polygon points="98,12 146,36 146,84 98,108 50,84 50,36" />
        </g>
        {/* Solid dot inside the right hexagon */}
        <circle cx="122" cy="60" r="10" fill={color} />

        {/* Text PVZ.FLOW */}
        {showText && (
          <text
            x="160"
            y="72"
            fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            fontSize="26"
            fontWeight="800"
            letterSpacing="0.04em"
            fill={color}
          >
            PVZ.FLOW
          </text>
        )}
      </svg>
    </div>
  );
};
