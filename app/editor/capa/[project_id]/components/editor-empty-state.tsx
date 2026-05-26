export function EditorEmptyState() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center"
    >
      <p
        className="text-center font-heading italic"
        style={{ color: "#9a9a9a", fontSize: "18px", lineHeight: "1.7" }}
      >
        Sua capa começa aqui.
        <br />
        <span style={{ fontSize: "13px", fontStyle: "normal" }}>
          Use as ferramentas à esquerda para adicionar texto,
          <br />
          imagens e elementos da marca.
        </span>
      </p>
    </div>
  );
}
