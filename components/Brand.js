// The Praevex logo, one component for every place it appears. Files come from scripts/build-brand.py.
// "lockup" is the statue with the wordmark, "mark" the statue alone, "tagline" adds "Political instability
// intelligence", "stacked" puts the wordmark under the statue. tone="dark" is white ink for dark grounds
// (the whole site), tone="light" black ink for paper.
const SIZE = {
  lockup: [694, 260], mark: [351, 520], tagline: [824, 300], stacked: [477, 520],
};

export default function Brand({ variant = "lockup", tone = "dark", height = 36, label, className = "" }) {
  const [w, h] = SIZE[variant];
  const small = height <= 56 && (variant === "lockup" || variant === "mark");
  const file = `praevex-${variant === "tagline" ? "lockup-tagline" : variant}-${tone}${small ? "-sm" : ""}.png`;
  return (
    <img
      className={`brand-img ${className}`.trim()}
      src={`/brand/${file}`}
      width={Math.round((height * w) / h)}
      height={height}
      alt={label ?? ""}
      decoding="async"
    />
  );
}
