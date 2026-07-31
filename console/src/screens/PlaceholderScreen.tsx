type Props = { title: string; body: string };

export function PlaceholderScreen({ title, body }: Props) {
  return (
    <section className="placeholder">
      <h2 className="brand" style={{ fontSize: "1.35rem" }}>
        {title}
      </h2>
      <p>{body}</p>
      <p className="muted">Screen scaffold next — FS API + command queue ready.</p>
    </section>
  );
}
