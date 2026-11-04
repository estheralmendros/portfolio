// Inline UI icons (social icons are not taken from simple-icons: LinkedIn is no longer shipped there).
const base = { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;

export function GitHubIcon() {
  return (
    <svg {...base}>
      <path fill="currentColor" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

export function LinkedInIcon() {
  return (
    <svg {...base}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2.3 7.6V18h2.6V9.6H6.3zM7.6 5.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM10.8 9.6V18h2.6v-4.2c0-1.1.4-2 1.6-2 1.1 0 1.3 1 1.3 2V18H19v-4.8c0-2.4-.5-3.8-3.2-3.8-1.3 0-2.1.7-2.5 1.3V9.6h-2.5z"
      />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg {...base}>
      <path fill="currentColor" fillRule="evenodd" d="M2 5h20v14H2V5zm2 2v.4l8 5 8-5V7H4zm16 2.8-8 5-8-5V17h16V9.8z" />
    </svg>
  );
}

export function WorkIcon() {
  return (
    <svg {...base}>
      <path fill="currentColor" fillRule="evenodd" d="M9 3h6a2 2 0 0 1 2 2v2h4v12H3V7h4V5a2 2 0 0 1 2-2zm0 4h6V5H9v2zM5 9v8h14V9H5z" />
    </svg>
  );
}

export function EducationIcon() {
  return (
    <svg {...base}>
      <path fill="currentColor" d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v4L12 21l7-3.8v-4L12 17l-7-3.8z" />
    </svg>
  );
}
