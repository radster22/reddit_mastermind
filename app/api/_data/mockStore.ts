export type PostRow = {
  post_id: string;
  subreddit: string;
  persona_username: string;
  title: string;
  body: string;
  timestamp: string;
  keyword_ids: string[];
};

export type CommentRow = {
  comment_id: string;
  post_id: string;
  parent_comment_id: string | null;
  persona_username: string;
  comment_text: string;
  timestamp: string;
};

export const mockPosts: PostRow[] = [];
export const mockComments: CommentRow[] = [];

export function resetMock() {
  mockPosts.length = 0;
  mockComments.length = 0;
}
