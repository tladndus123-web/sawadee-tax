/** Re-created on every screen change, so each screen fades up a little as it opens (.page-enter in globals.css) */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
