/**
 * Direction Room's turn protocol, shared by the Design Master's prompts (direction-prompts.ts, private) and the code that
 * reads its reply (direction-chat.ts): the words a reply uses for "the wireframe is unchanged" and "the wireframe is in
 * the html fence". Public in the ori-rooms mirror.
 */

/** probeHtml when the wireframe did not change this turn. */
export const DIRECTION_PROBE_NO_CHANGE = "[no change]";

/** probeHtml when the wireframe comes in a ```html fence after the JSON, which keeps raw markup out of the JSON. */
export const PROBE_HTML_FENCE_TOKEN = "[html fence]";
