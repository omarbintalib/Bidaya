# Saudi font source and embedded notices

Downloaded unchanged on 2026-10-04 from assets referenced by the [official Ministry of Culture Saudi font page](https://engage.moc.gov.sa/e/fonts/saudi-font/?lang=ar). Original TrueType files retain all embedded notices. No conversion or subsetting.

## Saudi-Regular.ttf

Name record 0: © 2024 Copyright the Ministry of Culture KSA. All rights reserved.

Name record 1: Saudi

Name record 2: Regular

Name record 7: Saudi is a trademark of the Ministry of Culture KSA and may be registered in certain jurisdictions

Name record 8: ArabicType Ltd

Name record 9:

Name record 11: http://arabictype.com/

## Saudi-Bold.ttf

Name record 0: © 2024 Copyright the Ministry of Culture KSA. All rights reserved.

Name record 1: Saudi Bold

Name record 2: Regular

Name record 7: Saudi is a trademark of the Ministry of Culture KSA and may be registered in certain jurisdictions

Name record 8: ArabicType Ltd

Name record 9:

Name record 11: http://arabictype.com/

## Original download assets

- [Saudi-Regular.ttf](https://twebs-uploads.s3.eu-west-1.amazonaws.com/1d4d9ab7-7e77-4872-8a15-76d095ecf7d2/custom_uploads/U2F1ZGktUmVndWxhci50dGYxNzM0ODY2OTk1MTI=.ttf) — SHA-256 `4457b9bbadf22456847e7ab4d36400e1cb60527b7e2d3cdefa722a4d2ffccc64`
- [Saudi-Bold.ttf](https://twebs-uploads.s3.eu-west-1.amazonaws.com/1d4d9ab7-7e77-4872-8a15-76d095ecf7d2/custom_uploads/U2F1ZGktQm9sZC50dGYxNzM0ODY2OTg0OTg=.ttf) — SHA-256 `66d24e307f0237bf2d2b779c0fe1f452150649237ab9925e05174fa017676516`

## WOFF2 copies

`Saudi-Regular.woff2` and `Saudi-Bold.woff2` are the same fonts repackaged losslessly as WOFF2 (fontTools, no subsetting; glyphs, outlines, layout tables and the name records above are unchanged). The only table not carried over is `DSIG`, the original file's digital signature, which no longer matches once the file is re-encoded and which browsers ignore. Browsers download about a third of the bytes. The TrueType files above remain the originals and are listed as the fallback in `src/index.css`.

## Honorific.woff2

Noto Naskh Arabic (© 2022 The Noto Project Authors, SIL Open Font License 1.1, no Reserved Font Name; licence in `Honorific-OFL.txt`), cut down to what the app uses it for: drawing ﷺ in English text (`src/index.css`, `unicode-range: U+FDFA`). 4.6 kB instead of 52.7 kB. Besides ﷺ it keeps the Arabic letters the browser's font renderer measures to align a font (ا إ ل ك ط ظ ت ث ـ); without them ﷺ rendered slightly differently. With them it renders pixel for pixel as the full font did. Made from the `@fontsource/noto-naskh-arabic` package with:

```sh
pyftsubset node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2 \
  --unicodes="U+FDFA,U+0627,U+0625,U+0644,U+0643,U+0637,U+0638,U+062A,U+062B,U+0640" \
  --flavor=woff2 --layout-features='*' --name-IDs='*' --name-languages='*' --output-file=public/fonts/Honorific.woff2
```

## Honorific-Arabic-400/500/700.woff2

IBM Plex Sans Arabic (© 2019 IBM Corp., SIL Open Font License 1.1; licence in `Honorific-Arabic-OFL.txt`), cut down to ﷺ for Arabic text: the Saudi font has no ﷺ, and without these the browser downloaded the full Plex Arabic font (43–44 kB per weight) to draw that one character. Like `Honorific.woff2`, each keeps the Arabic letters the font renderer measures for alignment, and renders pixel for pixel as the full font. As modified versions, they are renamed "Honorific Arabic" in their name tables; the copyright and licence records are unchanged. Made from the `@fontsource/ibm-plex-sans-arabic` package (for W in 400 500 700), then renamed with fontTools:

```sh
pyftsubset node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-$W-normal.woff2 \
  --unicodes="U+FDFA,U+0627,U+0625,U+0644,U+0643,U+0637,U+0638,U+062A,U+062B,U+0640" \
  --flavor=woff2 --layout-features='*' --name-IDs='*' --name-languages='*' --output-file=public/fonts/Honorific-Arabic-$W.woff2
```
