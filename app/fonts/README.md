# Self-hosted fonts

Loaded by `components/fonts.ts` with `next/font/local`. They used to come from
`next/font/google`, which made the compile depend on Google answering with URLs
Turbopack can parse (see the comment in `components/fonts.ts`).

All three are SIL Open Font License 1.1; each license file sits beside its font.

| File | Family | Source (google/fonts repo, `ofl/`) | Axes kept |
|---|---|---|---|
| `geist.woff2` | Geist | `geist/Geist[wght].ttf` | `wght` 100–900 |
| `caprasimo.woff2` | Caprasimo | `caprasimo/Caprasimo-Regular.ttf` | none (one weight) |
| `figtree.woff2` | Figtree | `figtree/Figtree[wght].ttf` | `wght` 300–900 |

Sources were taken from the [google/fonts](https://github.com/google/fonts) repo
at commit `7085eb89a950e85db5b166b7a58d414544b4140c`. SHA-256 of each source TTF:

| Source | SHA-256 |
|---|---|
| `Geist[wght].ttf` | `73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659` |
| `Caprasimo-Regular.ttf` | `786ab84ee787d40df55be78cb4361e485a1c6687195cbcccf3538cb5e46ced90` |
| `Figtree[wght].ttf` | `26ad3db9b31ff7dde67a91ff515d022d2f495cd506590699cf264f0bfe6fb714` |

Each file holds the `latin` and `latin-ext` subsets only, the same ranges Google's
stylesheet declares for those two subsets. Google served nothing else for
Caprasimo and Figtree. Geist also had Cyrillic, Cyrillic-ext and Vietnamese
subsets, which are left out: that text falls back to the system font.

## Regenerating a file

```bash
pip install fonttools brotli

pyftsubset <source>.ttf \
  --flavor=woff2 --layout-features='*' --name-IDs='*' \
  --output-file=<name>.woff2 \
  --unicodes='U+0000-00FF,U+0100-02BA,U+0131,U+0152-0153,U+02BB-02BC,U+02BD-02C5,U+02C6,U+02C7-02CC,U+02CE-02D7,U+02DA,U+02DC,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+2020,U+20A0-20AB,U+20AC,U+20AD-20C4,U+2113,U+2122,U+2191,U+2193,U+2212,U+2215,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD'
```
