import { define } from "../utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Git repositories</title>
      </head>
      <body class="bg-zinc-950 text-zinc-100 antialiased">
        <Component />
      </body>
    </html>
  );
});
