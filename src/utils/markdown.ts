/**
 * Markdown subset for news descriptions: **bold**, *italic*, `code`,
 * [links](url), "- " bullets, line breaks, blank-line paragraphs.
 * Raw HTML passes through unescaped — this renders admin-panel content
 * only (single operator by design); do not feed it untrusted text.
 */
export function renderMarkdown(src: string): string {
  const inline = (text: string) =>
    text
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      );

  const blocks: string[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push(`<div class="nb-para">${para.map(inline).join('<br>')}</div>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(`<ul class="nb-ul">${list.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
      list = null;
    }
  };
  for (const line of src.split(/\r?\n/)) {
    const li = /^[*-] (.+)$/.exec(line.trim());
    if (li) {
      flushPara();
      (list ??= []).push(li[1]);
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks.join('');
}
