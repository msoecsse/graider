import type { ReactElement, ReactNode } from "react";
import {
  parseCommentContent,
  type CommentContentBlock,
  type CommentInlineNode
} from "../../../src/shared/comment-content";

const inlineContent = (nodes: readonly CommentInlineNode[]): readonly ReactNode[] =>
  nodes.map((node, index) =>
    node.kind === "inline_code" ? (
      <code key={index} className="formatted-grading-comment__inline-code">
        {node.text}
      </code>
    ) : node.kind === "strong" ? (
      <strong key={index}>{inlineContent(node.children)}</strong>
    ) : node.kind === "emphasis" ? (
      <em key={index}>{inlineContent(node.children)}</em>
    ) : node.kind === "link_text" ? (
      <span key={index}>
        {node.text}
        {node.url === undefined ? "" : ` (${node.url})`}
      </span>
    ) : node.kind === "text" ? (
      node.text
    ) : null
  );

const blockContent = (block: CommentContentBlock, index: number): ReactElement =>
  block.kind === "code_block" ? (
    <pre key={index} className="formatted-grading-comment__code-block">
      <code>{block.text}</code>
    </pre>
  ) : block.kind === "list" ? (
    block.ordered ? (
      <ol key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{item.children.map(blockContent)}</li>
        ))}
      </ol>
    ) : (
      <ul key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{item.children.map(blockContent)}</li>
        ))}
      </ul>
    )
  ) : block.kind === "quote" ? (
    <blockquote key={index}>{block.children.map(blockContent)}</blockquote>
  ) : (
    <p key={index} className="formatted-grading-comment__paragraph">
      {inlineContent(block.children)}
    </p>
  );

export const FormattedGradingComment = ({ text }: { readonly text: string }): ReactElement => (
  <div className="formatted-grading-comment">{parseCommentContent(text).map(blockContent)}</div>
);
