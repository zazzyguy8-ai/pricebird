/**
 * X renders its own card type and ignores the Open Graph image unless one is
 * declared for it, so the same drawing is exported again under the name it
 * looks for. One file, two networks.
 */
export { default, alt, size, contentType } from './opengraph-image';
