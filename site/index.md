---
layout: default
---
<article class="home">
  <h1>{{ site.title }}</h1>
  <p>{{ site.description }}</p>
  <p>Posts are staged from <code>/hermes publish</code> after local approval. Deploy runs on pushes to the <code>content</code> branch.</p>

  <!-- hermes:curated-index -->
  <h2>By profile</h2>

  <h3>Research</h3>
  <ul>
    {% assign research_posts = site.posts | where_exp: "p", "p.categories contains 'research'" %}
    {% for post in research_posts %}
      <li><a href="{{ post.url | relative_url }}">{{ post.title }}</a> <span class="meta">{{ post.date | date: "%Y-%m-%d" }}</span></li>
    {% else %}
      <li class="empty">No research posts yet.</li>
    {% endfor %}
  </ul>

  <h3>Blog</h3>
  <ul>
    {% assign blog_posts = site.posts | where_exp: "p", "p.categories contains 'blog'" %}
    {% for post in blog_posts %}
      <li><a href="{{ post.url | relative_url }}">{{ post.title }}</a> <span class="meta">{{ post.date | date: "%Y-%m-%d" }}</span></li>
    {% else %}
      <li class="empty">No blog posts yet.</li>
    {% endfor %}
  </ul>

  <h3>Thread</h3>
  <ul>
    {% assign thread_posts = site.posts | where_exp: "p", "p.categories contains 'thread'" %}
    {% for post in thread_posts %}
      <li><a href="{{ post.url | relative_url }}">{{ post.title }}</a> <span class="meta">{{ post.date | date: "%Y-%m-%d" }}</span></li>
    {% else %}
      <li class="empty">No thread posts yet.</li>
    {% endfor %}
  </ul>

  <h3>Report</h3>
  <ul>
    {% assign report_posts = site.posts | where_exp: "p", "p.categories contains 'report'" %}
    {% for post in report_posts %}
      <li><a href="{{ post.url | relative_url }}">{{ post.title }}</a> <span class="meta">{{ post.date | date: "%Y-%m-%d" }}</span></li>
    {% else %}
      <li class="empty">No report posts yet.</li>
    {% endfor %}
  </ul>
  <!-- /hermes:curated-index -->

  <h2>All posts</h2>
  <ul>
    {% for post in site.posts %}
      <li><a href="{{ post.url | relative_url }}">{{ post.title }}</a> <span class="meta">{{ post.date | date: "%Y-%m-%d" }} · {{ post.categories | join: ", " }}</span></li>
    {% endfor %}
  </ul>
</article>
