interface HighliDoodleProps {
  className?: string;
  title?: string;
  decorative?: boolean;
}

export function HighliDoodle({
  className,
  title = "highli",
  decorative = false,
}: HighliDoodleProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 96 96"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M28 86c10 4 30 4 40 0"
        fill="none"
        stroke="rgba(47, 47, 48, 0.12)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M47 18 72 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M47 18 72 8"
        fill="none"
        stroke="#f4c542"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="m71 5 8-4 4 7-8 4Z"
        fill="#ffef7a"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M49 53v22M49 75 36 89M49 75 62 89M49 60 31 72M51 58c7-8 11-19 15-33"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M63 24c4-3 8 0 7 4-1 4-6 5-8 2-3-2-2-5 1-6Z"
        fill="#fff7df"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle
        cx="48"
        cy="39"
        r="16"
        fill="#fff7df"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M38 38c2-3 6-3 8 0M53 38c2-3 6-3 8 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M42 46c4 4 10 4 14 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M18 29c4-6 9-10 15-13M74 20c5 2 9 5 12 9"
        fill="none"
        stroke="#f4c542"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
