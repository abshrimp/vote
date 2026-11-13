import { Fragment, useMemo, type ReactNode } from "react";
import { parseRich } from "@/lib/voting/richtext.mjs";
import styles from "./ui.module.css";

export type RichNode = { t: string; v?: string; href?: string | null; c?: RichNode[] };

function render(nodes: RichNode[], prefix = ""): ReactNode[] {
  return nodes.map((node, index) => {
    const key = prefix + index;
    const children = render(node.c ?? [], key + ".");
    switch (node.t) {
      case "text": return <Fragment key={key}>{node.v}</Fragment>;
      case "br": return <br key={key} />;
      case "b": return <strong key={key}>{children}</strong>;
      case "i": return <em key={key}>{children}</em>;
      case "u": return <u key={key}>{children}</u>;
      case "a": return node.href?.startsWith("#")
        // In-page link: the vote page scrolls to the section (see VoteClient).
        ? <a key={key} href={node.href} data-section-link="">{children}</a>
        : <a key={key} href={node.href ?? undefined} target="_blank" rel="noopener noreferrer">{children}</a>;
      case "ol": return <ol key={key}>{children}</ol>;
      case "ul": return <ul key={key}>{children}</ul>;
      case "li": return <li key={key}>{children}</li>;
      default: return <div key={key}>{children.length ? children : <br />}</div>;
    }
  });
}

/** Renders a stored description (rich-text subset or legacy plain text) safely. */
export default function RichText({ value, className }: { value: string; className?: string }) {
  const nodes = useMemo(() => parseRich(value) as RichNode[], [value]);
  if (!nodes.length) return null;
  return <div className={className ? `${styles.rich} ${className}` : styles.rich}>{render(nodes)}</div>;
}
