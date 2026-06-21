type JSONContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ type?: string }>;
  text?: string;
};

function inlineToMarkdown(nodes?: JSONContent[]): string {
  if (!nodes) {
    return "";
  }

  return nodes
    .map((node) => {
      if (node.type === "hardBreak") {
        return "  \n";
      }

      if (node.type !== "text" || !node.text) {
        return "";
      }

      let text = node.text;
      const marks = node.marks?.map((mark) => mark.type) ?? [];

      if (marks.includes("code")) {
        text = `\`${text}\``;
      }
      if (marks.includes("bold")) {
        text = `**${text}**`;
      }
      if (marks.includes("italic")) {
        text = `*${text}*`;
      }

      return text;
    })
    .join("");
}

function listToMarkdown(
  items: JSONContent[] | undefined,
  depth: number,
  ordered: boolean,
): string {
  if (!items) {
    return "";
  }

  return items
    .map((item, index) => {
      const indent = "  ".repeat(depth);
      const inner = blocksToMarkdown(item.content, depth + 1)
        .split("\n\n")
        .join("\n");

      if (item.type === "taskItem") {
        const checkbox = item.attrs?.checked ? "[x]" : "[ ]";
        return `${indent}- ${checkbox} ${inner}`;
      }

      const marker = ordered ? `${index + 1}.` : "-";
      return `${indent}${marker} ${inner}`;
    })
    .join("\n");
}

function blocksToMarkdown(nodes?: JSONContent[], depth = 0): string {
  if (!nodes) {
    return "";
  }

  const blocks: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case "heading": {
        const rawLevel = node.attrs?.level;
        const level =
          typeof rawLevel === "number"
            ? Math.min(Math.max(rawLevel, 1), 6)
            : 1;
        blocks.push(`${"#".repeat(level)} ${inlineToMarkdown(node.content)}`);
        break;
      }
      case "paragraph":
        blocks.push(inlineToMarkdown(node.content));
        break;
      case "bulletList":
        blocks.push(listToMarkdown(node.content, depth, false));
        break;
      case "orderedList":
        blocks.push(listToMarkdown(node.content, depth, true));
        break;
      case "taskList":
        blocks.push(listToMarkdown(node.content, depth, false));
        break;
      case "blockquote":
        blocks.push(
          blocksToMarkdown(node.content, depth)
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n"),
        );
        break;
      case "codeBlock":
        blocks.push(
          `\`\`\`\n${node.content?.map((child) => child.text).join("") ?? ""}\n\`\`\``,
        );
        break;
      default:
        if (node.content) {
          blocks.push(blocksToMarkdown(node.content, depth));
        }
    }
  }

  return blocks.filter(Boolean).join("\n\n");
}

export function tiptapToMarkdown(content?: JSONContent): string {
  if (!content?.content) {
    return "";
  }

  return blocksToMarkdown(content.content).trim();
}
