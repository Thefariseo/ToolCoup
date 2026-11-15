// A button or link label that rolls up and out while a copy rolls in from below (the "text roll" of Museum of Motion's
// hover recipes, in CSS). The copy is aria-hidden, so the accessible name is the label alone. See .roll in app/praevex.css.
export default function Roll({ children }) {
  return (
    <span className="roll">
      <span className="roll-a">{children}</span>
      <span className="roll-b" aria-hidden="true">{children}</span>
    </span>
  );
}
