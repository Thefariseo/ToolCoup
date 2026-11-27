/** A figure with a bar beside it, scaled to the largest in its list. */
export default function Bar({ share, children }) {
  return (
    <span className="rank__bar"><i aria-hidden="true" style={{ "--v": Math.max(0, Math.min(1, share || 0)).toFixed(4) }} /><b>{children}</b></span>
  );
}
