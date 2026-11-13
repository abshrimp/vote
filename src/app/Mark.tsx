/** Neutral ballot mark, used until an organizer uploads their own logo. */
export default function Mark({ className, size = 28 }: { className?: string; size?: number }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 64 64"
    fill="none" aria-hidden="true">
    <rect x="12" y="20" width="40" height="36" rx="6" fill="#4a743d"/>
    <path d="M21 42h22" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    <rect x="20" y="8" width="24" height="29" rx="3" fill="white" stroke="#4a743d" strokeWidth="3"/>
    <path d="m26 22 5 5 8-10" stroke="#4a743d" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
