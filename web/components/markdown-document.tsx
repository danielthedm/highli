import type { ReactNode } from "react";

interface MarkdownDocumentProps {
  markdown: string;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

export function MarkdownDocument({ markdown }: MarkdownDocumentProps) {
  return (
    <div className="markdown-document">
      {parseBlocks(markdown).map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        /^(#{1,6})\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderBlock(block: Block, index: number) {
  if (block.type === "heading") {
    const level = Math.min(block.level + 1, 6);
    if (level === 2) return <h2 key={index}>{parseInline(block.text)}</h2>;
    if (level === 3) return <h3 key={index}>{parseInline(block.text)}</h3>;
    if (level === 4) return <h4 key={index}>{parseInline(block.text)}</h4>;
    if (level === 5) return <h5 key={index}>{parseInline(block.text)}</h5>;
    return <h6 key={index}>{parseInline(block.text)}</h6>;
  }

  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{parseInline(item)}</li>
        ))}
      </Tag>
    );
  }

  return <p key={index}>{parseInline(block.text)}</p>;
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    if (match[1] && match[2]) {
      const href = safeHref(match[2]);
      nodes.push(
        href ? (
          <a key={nodes.length} href={href} target="_blank" rel="noreferrer">
            {match[1]}
          </a>
        ) : (
          match[1]
        ),
      );
    } else if (match[3]) {
      nodes.push(<code key={nodes.length}>{match[3]}</code>);
    } else if (match[4]) {
      nodes.push(<strong key={nodes.length}>{match[4]}</strong>);
    }

    cursor = pattern.lastIndex;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function safeHref(value: string) {
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value;
  return null;
}
