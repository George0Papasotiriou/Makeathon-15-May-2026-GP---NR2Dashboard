import type { ReactNode } from "react";

interface EditorialPageProps {
  variant: "light" | "dark";
  children: ReactNode;
}

export function EditorialPage({ variant, children }: EditorialPageProps) {
  return (
    <div
      className={`editorial-page editorial-page--${variant}`}
      data-editorial-page
    >
      {children}
    </div>
  );
}
