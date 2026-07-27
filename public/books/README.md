# Contributor-owned book covers

Put optional cover art in one directory per catalog ID:

```text
public/books/my-book/cover.webp
```

Reference it from `app/catalog.ts`:

```ts
coverImage: "/books/my-book/cover.webp",
```

Only commit images you created or have permission to redistribute. See
`docs/adding-books.md` for dimensions, formats, and fallback behavior.
