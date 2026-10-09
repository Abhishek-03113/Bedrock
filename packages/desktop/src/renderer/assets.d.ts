// Ambient image modules (Vite resolves these, incl. via the `@static` alias).
declare module "*.png" {
  const url: string;
  export default url;
}
