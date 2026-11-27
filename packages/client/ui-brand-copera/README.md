---
description: "Copera Code brand for the Web and Desktop client: Copera symbol and name, blue and near-black palette layer, bundled Inter font, dark boot canvas, and Copera product-name copy in English and Portuguese."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-copera

English | [中文](README.zh.md)

## Summary

This package gives the Copera Code composition its identity. It fills the sidebar brand slots and the blank-home mark with the Copera symbol and name, adds a soft blue glow behind the blank home, stacks a token layer with the `#3463F3` primary, the `#050505` dark background, and the bundled Inter font, paints the dark boot canvas before any script runs, and replaces upstream product names in English and Portuguese copy. It adds no model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `copera` profile mounts this plugin through the `dsh-copera-app` bundle, which also switches off `ui-brand-official`. The row takes no configuration; the artwork, palette, and copy are fixed product identity.

### What changes on screen

- The sidebar shows the Copera symbol and the name "Copera Code"; the collapsed rail and the blank-home headline show the symbol.
- The blank home gets a faint blue glow behind the headline, below all Conversation content, instead of the pixel whale.
- Both palettes take the blue primary for filled buttons, switches, checkboxes, links, and keyboard focus rings; text on primary fills is white. The dark palette uses the `#050505` background and a matching sidebar fill. The light palette keeps its white surfaces.
- Interface text uses Inter, ahead of the built-in system stack. User font choices in Settings still lead the stack.
- English and Portuguese copy of the enabled browser plugins names Copera Code instead of the upstream product, and the DeepSeek account copy names the Copera account.

### Build profile and browser title

Build the client with `pnpm run build --profile copera` (or `build:artifacts --profile copera`). The profile sets `DSH_CLIENT_TITLE` to "Copera Code" for the tab title and `DSH_CLIENT_BUILD_PROFILE` to `copera`, which also names the product on the pre-plugin boot splash. Other build profiles keep their branding.

### Regenerating the font stylesheet

`src/client/fonts/inter-face.ts` embeds `Inter-latin-wght-normal.woff2` as a data URL. After replacing the font file, replace the `INTER_WOFF2_BASE64` string with the output of `node -e "process.stdout.write(require('fs').readFileSync('src/client/fonts/Inter-latin-wght-normal.woff2').toString('base64'))"` from this directory; `tests/font.client.spec.ts` fails while the two differ.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half [`src/client/index.ts`](src/client/index.ts) runs its effects for the plugin lifetime. It registers the `brand.copera` dictionary, applies [`locale-overrides.ts`](src/client/locale-overrides.ts) through `ctx.locale.override` for `en` and `pt`, adds the Inter `@font-face` as one `<style>` element, and stacks [`theme.ts`](src/client/theme.ts) as the `copera` layer of `ctx.theme.overrideTokens`. It then fills `sidebar.brand.mark` and `sidebar.brand.name` as one declaration-aware set, `conversation.hero.brand.mark`, the sign-in screen's `copera-account.gate.mark`, and the `conversation.hero.frame` layer through `ctx.slots.inject()`, so each occupant waits for its declaration and leaves with the fiber. The symbol is a package asset served by the client-modules asset route. The font is a data URL inside the bundle because that route serves images only. The node half [`src/index.ts`](src/index.ts) appends one `webserver/index-inject` style row that recolors `body[data-ds-dark-theme]` to `#050505`; the ui-theme boot script sets that attribute before first paint, so a light preference keeps its own canvas.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares the sidebar brand slots and their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares the blank-home mark slot and the `conversation.hero.frame` layer.
- [ui-theme](../ui-theme/README.md) — owns the palettes and `overrideTokens`.
- [locale](../locale/README.md) — owns dictionaries, the deployment language catalog, and `override`.

-----

<a id="model-experience"></a>
## Model Experience

### Brand presentation

#### What the model sees

Nothing. The `brand.copera` dictionary, the `copera` token layer, the bundled font, and the `webserver/index-inject` style row live in the browser and the index page; none of them enters prompts, tool results, or Session logs.

#### Token effect

None; no model-visible text is added.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The bundled Inter face covers the Latin subset only; other scripts fall back to the system stack.
- Copy overrides cover English and Portuguese, the two languages the `copera` profile offers. `tests/locale.client.spec.ts` pins the namespace of every enabled dictionary that names the upstream product, so a new upstream string fails there until it gains an override.
- Package metadata titles and descriptions (`locale/*.json` of other packages) are not overridden; a surface that lists plugins by their metadata can still show an upstream name.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
