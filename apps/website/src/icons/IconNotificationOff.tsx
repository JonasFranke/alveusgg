import React from "react";

type IconProps = {
  size?: number;
  className?: string;
  alt?: string;
};

const IconNotificationOff: React.FC<IconProps> = ({
  size = 24,
  className,
  alt,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    aria-label={alt}
  >
    <path
      fill="currentColor"
      d="M12 2a1 1 0 0 1 1 1v.75h.557c1.182 0 2.256.488 3.024 1.279a.24.24 0 0 1-.007.336l-.703.703c-.105.105-.278.095-.382-.01a2.708 2.708 0 0 0-1.932-.808h-3.114a2.714 2.714 0 0 0-2.709 2.544l-.22 3.534a8.877 8.877 0 0 1-1.574 4.516c-.05.073-.05.195-.111.258l-.764.77c-.098.1-.26.1-.34-.013a1.611 1.611 0 0 1-.017-1.871 7.377 7.377 0 0 0 1.308-3.754l.221-3.533a4.214 4.214 0 0 1 4.206-3.951H11V3a1 1 0 0 1 1-1Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M17.786 8.074 21.03 4.83a.75.75 0 0 0-1.06-1.06l-16 16a.75.75 0 1 0 1.06 1.06l3.046-3.045 1.174.14V19a2.75 2.75 0 1 0 5.5 0v-1.075l3.407-.409a1.617 1.617 0 0 0 1.135-2.528 7.376 7.376 0 0 1-1.308-3.754l-.198-3.16ZM16.372 9.49l-6.947 6.947.334.04c1.489.178 2.993.178 4.482 0l3.737-.449a.117.117 0 0 0 .082-.183 8.877 8.877 0 0 1-1.573-4.516l-.115-1.84ZM12 20.25c-.69 0-1.25-.56-1.25-1.25v-.75h2.5V19c0 .69-.56 1.25-1.25 1.25Z"
      clipRule="evenodd"
    />
  </svg>
);

export default IconNotificationOff;
