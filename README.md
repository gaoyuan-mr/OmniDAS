# OmniDAS

Static website for the OmniDAS benchmark and DAS-NanoNet results.

## Website

https://gaoyuan-mr.github.io/OmniDAS/

## Publish

In this repository's **Settings > Pages**, select **GitHub Actions** as
the source. The deployment workflow publishes `website/` after each push
to `main`. It can also be started from the Actions tab.

## Preview

```bash
python3 -m http.server 8765 --directory website
```

Open http://localhost:8765/.

## Verify

```bash
python3 -m unittest discover -s website/tests -q
```

This repository contains the website and its presentation assets.
Manuscript source files and raw research datasets are maintained separately.
