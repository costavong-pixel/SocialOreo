# Third-party dependency notice

SocialOreo uses third-party packages. Their license texts and attribution
requirements remain applicable to any dependency artifacts distributed with a
build. SocialOreo does not modify these packages.

| Package | Version | License | Use/distribution note |
| --- | --- | --- | --- |
| `@img/sharp-win32-x64` (through `sharp`) | 0.34.5 | Apache-2.0 AND LGPL-3.0-or-later | Optional image-processing platform binary used by the Next.js dependency tree. |
| `png-js` (through `@react-pdf/*`) | 2.0.0 | License metadata requires separate review | Included by the server-side PDF rendering dependency tree. |
| `axe-core` | 4.12.1 | MPL-2.0 | Development accessibility tooling. |
| `caniuse-lite` | 1.0.30001803 | CC-BY-4.0 | Browser-compatibility data used by build tooling and Next.js. |
| `lightningcss` | 1.32.0 | MPL-2.0 | CSS/build tooling. |
| `lightningcss-win32-x64-msvc` | 1.32.0 | MPL-2.0 | Optional platform binary for CSS/build tooling. |
| `@vercel/og` (vendored by Next.js) | 0.11.1 | MPL-2.0 | Framework-vendored package; not a direct SocialOreo dependency. |

The corresponding package `LICENSE`, `NOTICE`, and attribution files should
be retained whenever dependency artifacts are redistributed. This notice is
informational and is not a substitute for reviewing the license text for a
particular distribution or modification.
