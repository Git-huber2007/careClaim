/** The browser tab's title for the page it is rendered in. React hoists <title> into the document head. */
export function PageTitle({ children }: { children: string }) {
  return <title>{`${children} · CareClaim AI`}</title>;
}
