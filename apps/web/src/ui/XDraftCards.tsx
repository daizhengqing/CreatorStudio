import type { ScheduledPost } from '@creator-studio/contracts';
import { Button } from '@creator-studio/ui/button';
import { useToast } from './Toast';
import './x-draft-cards.css';

export function XDraftCards({ posts }: { posts: ScheduledPost[] }) {
  const toast = useToast();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('草稿已复制');
    } catch {
      toast.error('无法访问剪贴板，可以选中正文复制');
    }
  }

  if (!posts.length) return null;

  return (
    <section className="x-draft-cards" aria-label="X 草稿">
      {posts.map((post, postIndex) => (
        <article className="x-draft-card" key={postIndex}>
          <header>
            <h3>{post.title}</h3>
            <Button type="button" variant="outline" onClick={() => { void copy(post.text); }}>复制草稿</Button>
          </header>
          <p className="x-draft-text">{post.text}</p>
          {post.reason && <p className="x-draft-reason">{post.reason}</p>}
          <ul className="x-draft-sources" aria-label="草稿来源">
            {post.sourceUrls.map((url, sourceIndex) => (
              <li key={url}><a href={url} title={url} target="_blank" rel="noreferrer">来源 {sourceIndex + 1} ↗</a></li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
