/**
 * BarkSDK — Vision / image support
 *
 * Replaces: barkide_describe_image, directPicturePass, proxyPicture
 * Zero overlap with NTR SDK vision implementation.
 *
 * Two strategies:
 * 1. directPicturePass() — for native multimodal providers (codex, gemini)
 * 2. proxyPicture() — for non-native providers, dispatch to Gemini 2.5 Flash as backend
 */

import { defineAction } from "./action.mjs";

// Providers with native multimodal support — no vision proxy needed.
const NATIVE_VISION_SET = new Set(["codex", "gemini"]);

/**
 * Check if a provider supports native image input.
 * @param {string} alias
 * @returns {boolean}
 */
export function hasNativeVision(alias) {
  return NATIVE_VISION_SET.has(alias);
}

/**
 * Build an outlinePicture action for non-vision-native providers.
 * The model calls this action to get a textual description of an attached image.
 *
 * @param {object} imagesMap — live reference to workspace pictures
 * @returns {Array} — array with one defineAction() result, or empty
 */
export function outlinePicture(imagesMap) {
  return [
    defineAction(
      "describe_image",
      "Get a textual description of an image the user attached (this model can't see images directly). Call when you need image content to reason or answer. Call again with different 'focus' to inspect another aspect.",
      {
        type: "object",
        properties: {
          ref: { type: "string", description: "Image ref id from the system note (e.g. img_a1b2c3)" },
          focus: {
            type: "string",
            enum: ["general", "text", "code", "ui", "chart"],
            description: "Which aspect to describe. Defaults to 'general'.",
          },
        },
        required: ["ref"],
      },
      makeDescribeHandler(imagesMap)
    ),
  ];
}


function makeDescribeHandler(imagesMap) {
  return async (params) => {
    const ref = params.ref;
    const focus = (params.focus || "general").trim() || "general";

    if (!ref || typeof ref !== "string") {
      throw new Error("Missing required arg 'ref'.");
    }

    const img = imagesMap[ref];
    if (!img) {
      const available = Object.keys(imagesMap).join(", ") || "(none)";
      throw new Error(`No image with ref '${ref}'. Available refs this turn: ${available}.`);
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key not found. Set GEMINI_API_KEY or GOOGLE_API_KEY.");
    }

    const mediaType = img.mediaType || "image/png";
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: `Describe this image for a downstream coding agent that can't see it. Focus on '${focus}'. Be precise and factual; include any text/code verbatim if relevant.` },
          { inlineData: { mimeType: mediaType, data: img.content || img.data || "" } },
        ],
      }],
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Gemini vision returned ${resp.status}: ${errText.slice(0, 500)}`);
    }

    const data = await resp.json();
    const desc =
      (data.candidates?.[0]?.content?.parts?.[0]?.text) || "";

    return `[Image ${ref} — focus '${focus}']\n${desc}`;
  };
}


/**
 * Build structured content for native image passthrough.
 * @param {string} text - user text
 * @param {object} imagesMap
 * @returns {Array} - array of content parts
 */
export function directPicturePass(text, imagesMap) {
  const content = [{ type: "text", text }];
  for (const [ref, img] of Object.entries(imagesMap)) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType || "image/png",
        data: img.content || img.data || "",
      },
    });
  }
  return content;
}


/**
 * Build a system note about attached images for non-native providers.
 * @param {object} imagesMap
 * @returns {string}
 */
export function pictureNote(imagesMap) {
  const refs = Object.keys(imagesMap);
  if (refs.length === 0) return "";
  return (
    `\n[The user attached ${refs.length} image(s): ${refs.join(", ")}. ` +
    `You cannot see images directly. To inspect one, call describe_image with the ref. ` +
    `Describe the image and report what you see.]\n`
  );
}
