export const SYNTHETIC_LABEL = { en: "Synthetic data", es: "Datos sintéticos" } as const;

/** Required on every screen (CLAUDE.md rule 5). */
export function SyntheticBadge({ lang = "en" }: { lang?: keyof typeof SYNTHETIC_LABEL }) {
  return (
    <span className="nm-synthetic-badge" role="note" title="All customers and numbers here are generated, not real.">
      {SYNTHETIC_LABEL[lang]}
    </span>
  );
}
