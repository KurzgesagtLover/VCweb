function createLoreDocument(html: string, css: string) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline'; font-src * data:;">
  <style>
    @font-face {
      font-family: "VC Anemone Air";
      src: url("/fonts/Cafe24OhsquareAir-v2.0.otf") format("opentype");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: "VC S-Core Dream";
      src: url("/fonts/SCDream2.otf") format("opentype");
      font-style: normal;
      font-weight: 200;
      font-display: swap;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      background: #08080b;
      color: #ededf2;
      font-family: "VC S-Core Dream", "Malgun Gothic", sans-serif;
      line-height: 1.55;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: "VC Anemone Air", "VC S-Core Dream", "Malgun Gothic", sans-serif;
      font-weight: 400;
    }
    button, input, select, textarea { font: inherit; }
    img, video { max-width: 100%; height: auto; }
    hr {
      margin: 2rem 0;
      border: 0;
      border-top: 1px solid #30303a;
    }
    .wiki-table {
      width: 100%;
      margin: 1.25rem 0;
      border-collapse: collapse;
    }
    .wiki-table th, .wiki-table td {
      border: 1px solid #30303a;
      padding: 0.65rem 0.75rem;
      text-align: left;
      vertical-align: top;
    }
    .wiki-table th { background: #141418; color: #00a9c4; }
    .wiki-callout {
      margin: 1.25rem 0;
      border: 1px solid rgba(0, 169, 196, 0.42);
      border-left-width: 4px;
      background: rgba(0, 169, 196, 0.06);
      padding: 0.9rem 1rem;
    }
    .wiki-callout > :first-child { color: #00a9c4; }
    .wiki-callout > :last-child { margin-bottom: 0; }
    .wiki-code-block {
      margin: 1.25rem 0;
      border: 1px solid #30303a;
      border-radius: 4px;
      background: #050507;
      padding: 1rem;
      overflow-x: auto;
      color: #cdebf0;
      font-family: ui-monospace, "Cascadia Code", monospace;
      font-size: 0.82rem;
      white-space: pre-wrap;
    }
    .wiki-image-border { border: 1px solid #5d5d69; padding: 4px; }
    .wiki-image-rounded { border-radius: 12px; }
    .wiki-image-shadow { box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
    .wiki-image-small { width: min(40%, 24rem); }
    .wiki-image-medium { width: min(70%, 48rem); }
    .wiki-image-full { width: 100%; }
    .wiki-image-left, .wiki-image-center, .wiki-image-right { display: block; }
    .wiki-image-left { margin: 1rem auto 1rem 0; }
    .wiki-image-center { margin: 1rem auto; }
    .wiki-image-right { margin: 1rem 0 1rem auto; }
    .wiki-image-figure { margin: 1.5rem 0; }
    .wiki-image-figure figcaption {
      margin-top: 0.6rem;
      color: #8d8d99;
      font-size: 0.78rem;
      text-align: center;
    }
    ${css}
  </style>
</head>
<body>${html}</body>
</html>`;
}

export function LoreFrame({
  html,
  css,
  title,
  className,
}: {
  html: string;
  css: string;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      className={className ? `lore-frame ${className}` : "lore-frame"}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={createLoreDocument(html, css)}
    />
  );
}
