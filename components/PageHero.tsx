import type { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Right-aligned slot, for example a count or an action. */
  aside?: ReactNode;
}

/** Page header for public pages: eyebrow, the page's single h1 and an intro line. */
export function PageHero({ eyebrow, title, intro, aside }: PageHeroProps): React.ReactElement {
  return (
    <header className="page-hero fade-in-up">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {intro && <p className="page-hero-intro">{intro}</p>}
      </div>
      {aside}
    </header>
  );
}
