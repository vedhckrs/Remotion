# Verified primary references

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Vercel Queue poll mode](https://vercel.com/docs/queues/poll-mode)
- [Vercel private Blob storage](https://vercel.com/docs/vercel-blob/private-storage)
- [Vercel signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)

Package API types were checked against the installed pinned SDKs. The source report's citation IDs and linked sandbox download are not reproducible references. Endor package-decision/package-risk tooling is unavailable in this session (no connector or dependency-reviewer/endorctl executable); its risk assessment has not been completed. Dependency installation is authorized by the architecture upgrade request; known-vulnerability scanning remains a separate check.

Build-tool advisory fixes verified against the official npm registry and maintainer advisories: [pnpm patched release](https://github.com/advisories/GHSA-vq4v-j7r6-jq4m), [esbuild patched release](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr). Pinned pnpm is now 10.34.5 and tsx 4.23.15 resolves patched esbuild. Full dependency audit after updating reports zero known advisories; this is distinct from an unavailable Endor risk verdict.
