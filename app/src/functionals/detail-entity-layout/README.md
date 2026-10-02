# Detail entity layout

The composed shell shared by entity detail pages. Import `DetailEntityLayout`
and `DetailTabsNavItem` from `@/functionals/detail-entity-layout`.

```tsx
<DetailEntityLayout>
  <DetailEntityLayout.Top>
    <Page.Header>...</Page.Header>
    <EntityStats />
  </DetailEntityLayout.Top>
  <DetailEntityLayout.Body>
    <DetailEntityLayout.Tabs activeTab={activeTab} items={tabs} />
    <DetailEntityLayout.Content>{children}</DetailEntityLayout.Content>
  </DetailEntityLayout.Body>
</DetailEntityLayout>
```

Top stays fixed. Body fills the remaining height; only Content scrolls.
Each region accepts its own `className`, rather than forwarding structural props
through several layouts. The tab implementation is internal; callers provide
labels, URLs and the active value. The shell owns no business URLs or queries.
