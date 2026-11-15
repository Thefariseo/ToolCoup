// A heading whose words rise out of a clip once, on load. Pure CSS (see .rise in app/praevex.css), so it also runs
// in server-rendered pages and without JavaScript; reduced motion shows the words at rest. The words stay real text.
export default function Rise({ as: Tag = "span", children, className = "", from = 0 }) {
  const words = String(children).split(" ");
  return (
    <Tag className={`rise ${className}`.trim()}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="rise-w"><span style={{ "--i": i + from }}>{w}</span></span>{i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
