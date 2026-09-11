# National Medicaid Planning LLC

Responsive static website for Richard Ladson, CMP™. Built from the approved ivory, navy and gold homepage, with independent photos, logo, SVG icons, divider and step-number files.

## Netlify settings

| Setting | Value |
| --- | --- |
| Framework | Other / no framework |
| Production branch | `main` |
| Base directory | Repository root |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 22 |
| Required secrets | None |

`netlify.toml` contains these settings and response headers. The build command validates the already-authored static website; there is no bundler or third-party dependency to install. A custom 404 page is included.

Once the GitHub repository is linked in Netlify, pushes to `main` trigger a new deployment. Netlify documents [Git-based deploys](https://docs.netlify.com/deploy/create-deploys/#deploy-with-git) and [configuration files](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Editing the website

- `dist/index.html`: page copy, links, FAQ content and dialogs.
- `dist/styles.css`: layout, colors, typography and mobile rules.
- `dist/app.js`: navigation and dialogs.
- `dist/site-config.js`: optional online booking destination.
- `dist/assets/photos/`: four individually optimized WebP family images and Richard’s portrait.
- `dist/assets/brand/`: the supplied original logo.
- `dist/assets/icons/` and `dist/assets/decor/`: individual SVG assets.

The second photo set was used, preserving the original mockup’s compositions. These are AI-generated family scenes. Richard’s portrait uses an optimized copy of his supplied original photograph, displayed in a responsive head-and-shoulders crop matching the first portrait. See `ASSET-NOTES.md`.

## Consultation buttons

The site currently opens a working dialog with Richard’s phone number and email. To send all consultation buttons to a HighLevel booking calendar instead, set the full HTTPS booking URL in `dist/site-config.js`:

```js
window.NMP_CONFIG = Object.freeze({
  bookingUrl: "https://your-actual-calendar-link"
});
```

Use the actual public calendar link; the example is not a working booking page. Leave the value empty to keep call/email scheduling. Invalid or non-HTTPS values also retain the call/email dialog.

The project does not submit leads or documents to a CRM. Linking a hosted HighLevel calendar lets that calendar manage its own booking and CRM workflow.

## Local verification

Run `npm run build` with Node 22 or newer. The validator checks local references, entrypoints, HTML anchors, image attributes, and JavaScript syntax. You can serve `dist` with a local static server for manual viewing.

## Domain and future integrations

Publishing on a Netlify-provided address does not change `nationalmedicaidplanning.com` DNS. Add the custom domain through Netlify when ready. If you add analytics, forms, an embedded calendar or other external scripts, update the privacy wording and the Content Security Policy in `netlify.toml` to match the services actually enabled.

This repository contains website source and public business information only. Do not commit passwords, access tokens, CRM exports or client records.
