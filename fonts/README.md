# Font per cinese, coreano e arabo

Sottoinsiemi dei font Noto (Google, licenza SIL Open Font License 1.1, testi in `OFL-*.txt`), usati solo nel PDF
delle lettere in cinese, coreano e arabo e caricati dalla pagina solo quando servono.

- `NotoSansSC-*.ttf`: Noto Sans SC, caratteri GB2312 (6 763 ideogrammi) + latino e punteggiatura.
- `NotoSansKR-*.ttf`: Noto Sans KR, tutte le sillabe hangul + latino e punteggiatura.
- `NotoNaskhArabic-*.ttf`: Noto Naskh Arabic, blocchi arabi completi.

Ricavati da `@expo-google-fonts/noto-sans-sc`, `noto-sans-kr`, `noto-naskh-arabic` (pesi 400 e 700) con
`pyftsubset … --layout-features='*' --no-hinting`.
