type Post = { postId: string };
type User = { userId: string };
type Handle = { handle: string };
type Community = { communityId: string };
type List = { listId: string };

type Page = { cursor?: string; count?: number };

export type ResearchInput =
  | (Page & (
    | { operation: 'search_posts'; query: string; mode?: 'latest' | 'top' | 'media' | 'trend' }
    | { operation: 'search_users'; query: string }
    | ({ operation: 'replies' | 'conversation' | 'reposters' } & Post)
    | ({ operation: 'user_posts'; mode?: 'posts' | 'posts_and_replies' | 'media' } & User)
    | ({ operation: 'user_connections'; kind: 'followers' | 'verified_followers' | 'following' | 'subscriptions' } & User)
    | { operation: 'trends'; category?: string }
    | ({ operation: 'community_posts' } & Community)
    | ({ operation: 'community_people'; role: 'members' | 'moderators' } & Community)
    | ({ operation: 'list_posts' | 'list_members' } & List)
    | { operation: 'bookmarks'; account: string }
  ))
  | ({ operation: 'post' } & Post)
  | ({ operation: 'user' } & (User | Handle))
  | ({ operation: 'user_about' } & Handle)
  | ({ operation: 'community' } & Community);

// Python 只返回解析后的内容；不同查询可包含帖子、用户、趋势或社区。
export type ResearchResult =
  | { item: Record<string, unknown> | null }
  | { items: Record<string, unknown>[]; nextCursor: string | null };
