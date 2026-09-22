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
    ) : (
      node.text
    )
  );

const blockContent = (block: CommentContentBlock, index: number): ReactElement =>
  block.kind === "code_block" ? (
    <pre key={index} className="formatted-grading-comment__code-block">
      <code>{block.text}</code>
    </pre>
  ) : (
    <p key={index} className="formatted-grading-comment__paragraph">
      {inlineContent(block.children)}
    </p>
  );

export const FormattedGradingComment = ({ text }: { readonly text: string }): ReactElement => (
  <div className="formatted-grading-comment">{parseCommentContent(text).map(blockContent)}</div>
);
