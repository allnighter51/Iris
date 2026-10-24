const p = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg {...p}>
    <path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8z" />
    <circle cx="8" cy="8" r="2" />
    {off && <path d="M2 14L14 2" />}
  </svg>
);
export const LockIcon = ({ open }: { open?: boolean }) => (
  <svg {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d={open ? "M5.5 7V5a2.5 2.5 0 015 0" : "M5 7V5a3 3 0 016 0v2"} />
  </svg>
);
export const CopyIcon = () => (
  <svg {...p}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
  </svg>
);
export const TrashIcon = () => (
  <svg {...p}>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 7v4M9.5 7v4" />
  </svg>
);
