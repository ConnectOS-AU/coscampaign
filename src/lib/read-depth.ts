const SEGMENT_PERCENTAGES = [25, 50, 75, 100] as const;

function pixelTag(url: string): string {
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />`;
}

/**
 * Injects invisible tracking pixels at ~25/50/75/100% through the body HTML.
 * Email clients block JS and can't report scroll position, so this is the
 * standard proxy: the highest segment whose pixel fires approximates how far
 * a recipient read, and it only fires at all if images were downloaded.
 *
 * Insertion points are snapped forward to the next `>` so a pixel is only
 * ever inserted between tags, never mid-attribute.
 */
export function injectReadDepthPixels(html: string, pixelUrlForSegment: (segment: 1 | 2 | 3 | 4) => string): string {
  const bodyCloseMatch = /<\/body\s*>/i.exec(html);
  const bodyEnd = bodyCloseMatch ? bodyCloseMatch.index : html.length;

  const insertions: { index: number; tag: string }[] = SEGMENT_PERCENTAGES.map((pct, i) => {
    const segment = (i + 1) as 1 | 2 | 3 | 4;
    const tag = pixelTag(pixelUrlForSegment(segment));

    if (pct === 100) {
      return { index: bodyEnd, tag };
    }

    const target = Math.floor((bodyEnd * pct) / 100);
    const nextTagClose = html.indexOf(">", target);
    const index = nextTagClose === -1 || nextTagClose >= bodyEnd ? bodyEnd : nextTagClose + 1;
    return { index, tag };
  });

  insertions.sort((a, b) => b.index - a.index);

  let result = html;
  for (const { index, tag } of insertions) {
    result = result.slice(0, index) + tag + result.slice(index);
  }
  return result;
}
