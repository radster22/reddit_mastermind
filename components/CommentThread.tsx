type Comment = {
  comment_id: string;
  parent_comment_id: string | null;
  persona_username: string;
  comment_text: string;
  timestamp: string;
};

function CommentNode({ comment, depth }: { comment: Comment; depth: number }) {
  return (
    <div className="mb-3" style={{ marginLeft: depth * 16 }}>
      <div className="p-3 rounded-lg border border-slate-200 bg-white">
        <p className="text-sm font-semibold text-slate-700">
          {comment.persona_username}
        </p>
        <p className="text-sm text-slate-800">{comment.comment_text}</p>
        <p className="text-xs text-slate-500 mt-1">
          {new Date(comment.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function CommentThread({ comments }: { comments: Comment[] }) {
  const tree = buildTree(comments);

  return (
    <div>
      {tree.map((node) => (
        <Thread key={node.comment.comment_id} node={node} depth={0} />
      ))}
    </div>
  );
}

type Node = { comment: Comment; children: Node[] };

function buildTree(comments: Comment[]): Node[] {
  const map = new Map<string, Node>();
  const roots: Node[] = [];

  comments.forEach((c) => {
    map.set(c.comment_id, { comment: c, children: [] });
  });

  comments.forEach((c) => {
    const node = map.get(c.comment_id)!;
    if (c.parent_comment_id && map.has(c.parent_comment_id)) {
      map.get(c.parent_comment_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function Thread({ node, depth }: { node: Node; depth: number }) {
  return (
    <div>
      <CommentNode comment={node.comment} depth={depth} />
      {node.children.map((child) => (
        <Thread
          key={child.comment.comment_id}
          node={child}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
