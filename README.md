# Gear Up Store

Static Arabic storefront with Vercel Functions and a private Vercel Blob catalog.
Product names, prices and compressed images are saved together in `gear/catalog.json`.
The browser only displays a publish success after the storage write returns a version.

## Production setup

1. In the **geraup-store** Vercel project, create a **Private Blob** store from
   **Storage → Create Database / Store → Blob**. Connect it to **Production**.
   Vercel supplies either `BLOB_STORE_ID` and OIDC, or `BLOB_READ_WRITE_TOKEN`.
   Keep these credentials on the server; never place them in HTML or browser code.
2. In **Settings → Environment Variables**, set `GEAR_ADMIN_PASSWORD` to a unique
   password of at least 16 characters. Enter it directly in Vercel, not in GitHub
   or chat. The former short PIN is no longer used for publishing.
3. For preview testing, connect a **separate** private Blob store and a different
   admin password to **Preview**. Preview and Production must not share storage.
4. Deploy this branch as a preview. The project uses framework **Other**,
   build command `node scripts/build.mjs`, and output directory `public`.
   `vercel.json` declares these settings; remove conflicting dashboard overrides.
5. Log in through the gear icon. Add a product with a picture, select **حفظ ونشر**,
   and verify it from a different browser. Test against the Preview store first.
6. After reviewing the preview, merge/deploy to Production. Environment changes
   require a new deployment.

Without Blob setup the storefront shows the bundled original 11 products and
publishing fails with a setup message. Without a configured admin password the
dashboard refuses login. A successful deployment alone does not prove storage
is connected: complete step 5 before release.

### Recover products from the old site

Use the same browser and domain where you previously edited products. After
logging in, select **استرجاع منتجات الجهاز القديمة**, review the draft, and
select **حفظ ونشر**. This reads the old `gear-catalog` entry without deleting it.
Unpublished drafts use a separate `gear-draft-v2` entry and never replace the
public catalog automatically. A backup can be downloaded from the dashboard.
The original two embedded images remain in `assets/catalog.seed.json`.

## Local verification

Node.js 24 and pnpm 11:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

The dev server listens only on `127.0.0.1:4173`, writes a test catalog to
`.local/catalog.json`, and writes its generated test password to
`.local/dev-password.txt`. It never contacts production storage. Set
`GEAR_DEV_PASSWORD` to keep a local password across restarts, and
`GEAR_DEV_FAIL_SAVE=1` to simulate a storage outage.

## Behavior and limits

- Session authentication uses a signed, expiring, HttpOnly, SameSite cookie;
  cookies are Secure over HTTPS. Requests that change data require the same
  origin. Changing the admin password invalidates existing sessions.
- The published catalog is read without CDN caching. ETag checks prevent an
  older draft from overwriting a newer save, including simultaneous first saves.
- Failed saves retain the local draft. Session expiry requires login again.
- The catalog allows up to 200 products and a 3 MiB save payload. The browser
  resizes JPG/PNG/WebP uploads to at most 640 px. Images are embedded in the
  catalog, which suits this small shop; large catalogs should move images to
  separate storage objects.
- Blob and Functions use the connected Vercel account's plan and usage limits.
  Review the storage dialog before creating a store or accepting a paid plan.
- Product strings are escaped when rendered. SVG and executable image URLs
  are rejected. Checkout still creates a WhatsApp message; no payment is taken.

References: [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js),
[Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk),
[private storage](https://vercel.com/docs/vercel-blob/private-storage).
