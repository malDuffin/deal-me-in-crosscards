/** Red octagonal stop sign, no lettering. */
export function StopSign({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M8.1 2.2h7.8L21.8 8.1v7.8l-5.9 5.9H8.1L2.2 15.9V8.1L8.1 2.2z"
        fill="#d32f2a"
        stroke="#f4ece0"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
