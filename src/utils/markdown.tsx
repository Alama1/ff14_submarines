import { Fragment } from 'react';
import type { ReactNode } from 'react';

const TOKEN =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;

/** Inline subset: `code`, **bold**, *italic*, [links](https://…). */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  const pushText = (s: string) => {
    if (s) out.push(<Fragment key={`t${k++}`}>{s}</Fragment>);
  };
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    pushText(text.slice(last, m.index));
    const t = m[0];
    if (t[0] === '`') out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t[0] === '*') out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    else
      out.push(
        <a key={k++} href={m[3]} target="_blank" rel="noopener noreferrer">
          {m[2]}
        </a>,
      );
    last = m.index + t.length;
  }
  pushText(text.slice(last));
  return out;
}

/**
 * Tiny markdown subset for news announcements: **bold**, *italic*, `code`,
 * [links](https://…), "- " bullets, line breaks and blank-line paragraphs.
 * Returns React elements (text can never become markup), links are
 * http(s)-only — safe for admin-authored content shown to customers.
 * Mirrors admin-panel/src/lib/markdown.tsx.
 */
export function renderMarkdown(src: string): ReactNode {
  const blocks: ReactNode[] = [];
  let list: string[] | null = null;
  let para: string[] = [];
  let n = 0;
  const flushPara = () => {
    if (!para.length) return;
    const lines = para;
    para = [];
    blocks.push(
      <div key={`b${n++}`} className="nb-para">
        {lines.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(l)}
          </Fragment>
        ))}
      </div>,
    );
  };
  const flushList = () => {
    if (!list) return;
    const items = list;
    list = null;
    blocks.push(
      <ul key={`b${n++}`} className="nb-ul">
        {items.map((l, i) => (
          <li key={i}>{renderInline(l)}</li>
        ))}
      </ul>,
    );
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
  return blocks;
}
