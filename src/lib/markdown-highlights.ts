type Node = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] };

/** Match rendered text, including phrases spanning emphasis or inline code. */
export function highlightMarkdown(options: { terms: string[] }) {
  return (tree: Node) => {
    const leaves: { node: Node; parent: Node; start: number; end: number }[] = [];
    let text = '';
    const collect = (node: Node, parent?: Node) => {
      if (node.type === 'text' && parent) {
        const start = text.length;
        text += node.value ?? '';
        leaves.push({ node, parent, start, end: text.length });
      } else {
        for (const child of node.children ?? []) collect(child, node);
        if (node.type === 'element' && /^(p|li|h[1-6]|pre|tr|blockquote)$/.test(node.tagName ?? '')) text += '\n';
      }
    };
    collect(tree);
    const ranges: { start: number; end: number }[] = [];
    for (const term of options.terms.filter(Boolean)) {
      let start = text.indexOf(term);
      while (start !== -1) {
        ranges.push({ start, end: start + term.length });
        start = text.indexOf(term, start + term.length);
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    const merged: typeof ranges = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    for (const leaf of leaves) {
      const matches = merged.filter((r) => r.start < leaf.end && r.end > leaf.start);
      if (!matches.length) continue;
      const replacements: Node[] = [];
      let cursor = 0;
      const value = leaf.node.value ?? '';
      for (const range of matches) {
        const start = Math.max(0, range.start - leaf.start);
        const end = Math.min(value.length, range.end - leaf.start);
        if (start > cursor) replacements.push({ type: 'text', value: value.slice(cursor, start) });
        replacements.push({ type: 'element', tagName: 'mark', properties: { className: ['keyword-highlight'] }, children: [{ type: 'text', value: value.slice(start, end) }] });
        cursor = end;
      }
      if (cursor < value.length) replacements.push({ type: 'text', value: value.slice(cursor) });
      const siblings = leaf.parent.children!;
      siblings.splice(siblings.indexOf(leaf.node), 1, ...replacements);
    }
  };
}
