export const metadata = {
  title: "Editor de Capa · Autoria",
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f5f3ed] text-[#1a1a2e]">
      {children}
    </div>
  );
}
