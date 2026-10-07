const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

const make = (paths) =>
  function Icon({ className = 'h-5 w-5', ...props }) {
    return (
      <svg {...base} className={className} aria-hidden="true" {...props}>
        {paths}
      </svg>
    );
  };

export const IconLogo = ({ className = 'h-9 w-9' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2dd4bf" />
        <stop offset="1" stopColor="#818cf8" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="#0e1426" stroke="url(#lg)" strokeOpacity=".5" />
    <path d="M16 8v16M8 16h16" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="24" cy="8" r="2.5" fill="#2dd4bf" />
  </svg>
);

export const IconGrid = make(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconLogout = make(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>);
export const IconBolt = make(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />);
export const IconTerminal = make(<><path d="m4 17 6-6-6-6M12 19h8" /></>);
export const IconFile = make(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>);
export const IconShield = make(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>);
export const IconCheck = make(<path d="M20 6 9 17l-5-5" />);
export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />);
export const IconAlert = make(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconArrowLeft = make(<path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconRefresh = make(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>);
export const IconSparkle = make(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />);
export const IconWallet = make(<><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><circle cx="16" cy="14" r="1.5" /></>);
export const IconFlag = make(<><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></>);
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconBuilding = make(<><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M12 7v4M10 9h4M9 21v-4h6v4" /></>);
export const IconLayers = make(<><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>);
export const IconUpload = make(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>);
export const IconPrinter = make(<><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>);


export const Spinner = ({ className = 'h-4 w-4' }) => (
  <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);
