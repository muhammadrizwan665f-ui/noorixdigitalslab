import { Link } from '../lib/router';
import { useApp } from '../lib/store';
import { useSeo, useNoindex } from '../lib/seo';
import { POSTS, getPost, type Block } from '../content/blog';

const Crumbs = ({ items }: { items: [string, string?][] }) => (
  <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">{items.map(([l, to], i) => <span key={l}>{i > 0 && ' / '}{to ? <Link to={to} className="hover:text-brand">{l}</Link> : <span className="text-slate-700">{l}</span>}</span>)}</nav>
);
const render = (b: Block, i: number) => 'h2' in b ? <h2 key={i} className="mb-2 mt-8 text-xl font-bold text-navy-900">{b.h2}</h2>
  : 'p' in b ? <p key={i} className="mt-3 leading-relaxed text-slate-700">{b.p}</p>
  : 'ul' in b ? <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">{b.ul.map((x) => <li key={x}>{x}</li>)}</ul>
  : <ol key={i} className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-700">{b.ol.map((x) => <li key={x}>{x}</li>)}</ol>;

export function BlogIndex() {
  const { brand } = useApp();
  useSeo(`Blog — Guides to Digital Subscriptions | ${brand.name}`, `Practical guides on digital subscriptions, safe online buying and using your ${brand.name} wallet.`);
  return <div className="container-x max-w-3xl py-10"><Crumbs items={[['Home', '/'], ['Blog']]} />
    <h1 className="text-2xl font-bold sm:text-3xl">{brand.name} Blog</h1><p className="mt-2 text-slate-600">Short, practical guides to buying and using digital subscriptions.</p>
    <div className="mt-6 space-y-4">{POSTS.map((p) => <article key={p.slug} className="card p-5"><h2 className="text-lg font-bold"><Link to={`/blog/${p.slug}`} className="hover:text-brand">{p.title}</Link></h2><p className="mt-1 text-sm text-slate-600">{p.description}</p><p className="mt-2 text-xs text-slate-400">Updated {p.updated} · {p.minutes} min read</p></article>)}</div></div>;
}

export function BlogPost({ slug }: { slug: string }) {
  const { brand } = useApp(); const post = getPost(slug);
  useSeo(post ? `${post.title} | ${brand.name}`.slice(0, 70) : `Article not found — ${brand.name}`, post?.description);
  useNoindex(!post);
  if (!post) return <div className="container-x py-20 text-center"><h1 className="text-3xl font-extrabold">Article not found</h1><Link to="/blog" className="btn-primary mt-6">All articles</Link></div>;
  return <div className="container-x max-w-3xl py-10"><Crumbs items={[['Home', '/'], ['Blog', '/blog'], [post.title]]} />
    <article><h1 className="text-2xl font-bold sm:text-4xl">{post.title}</h1><p className="mt-2 text-sm text-slate-400">Updated {post.updated} · {post.minutes} min read · By the {brand.name} team</p>
      {post.body.map(render)}</article>
    <aside className="card mt-10 p-5"><h2 className="font-bold">Related</h2><ul className="mt-2 space-y-1 text-sm">{post.related.map((r) => <li key={r.to}><Link to={r.to} className="text-brand hover:underline">{r.label}</Link></li>)}</ul></aside></div>;
}
