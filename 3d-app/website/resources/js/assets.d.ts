/** Vite `?inline` imports: the file as a data URL inside the bundle. */
declare module '*?inline' {
  const src: string;
  export default src;
}
