export async function generateBarcodeDataUrl(isbn: string): Promise<string | null> {
  const clean = isbn.replace(/[^0-9X]/gi, "");
  if (clean.length !== 13 && clean.length !== 10) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — bwip-js has conditional exports that tsc can't resolve dynamically
    const bwipjs = (await import("bwip-js")).default;
    const canvas = document.createElement("canvas");
    await bwipjs.toCanvas(canvas, {
      bcid: "ean13",
      text: clean.length === 10 ? `978${clean.slice(0, 9)}` : clean,
      scale: 3,
      height: 15,
      includetext: true,
      textxalign: "center",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
