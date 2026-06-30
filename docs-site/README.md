# fasteval Mintlify docs

This directory contains the public Mintlify documentation site for `fasteval`.
It was merged from `CorrectRoadH/mintlify-docs` and is kept separate from the
repo's implementation docs in `docs/`.

## Local development

Run the Mintlify preview from the repository root:

```sh
pnpm run docs:dev
```

The preview expects `docs-site/docs.json` as the Mintlify configuration.

## Checks

Use these commands before changing the published docs:

```sh
pnpm run docs:validate
pnpm run docs:links
```

The CI workflow runs both commands on Node 22. The Mintlify CLI currently rejects
Node 26 for validation commands, so local validation may require switching to an
LTS Node version.

## Source material

The previous `mintlify-docs` repository also contained a `sources/` folder with
scraped source material. That folder is intentionally not imported here because
it is ignored by Mintlify and is not part of the published documentation surface.
