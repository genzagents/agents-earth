/**
 * Module augmentations for installed Fastify plugins that don't ship type augmentations
 * or require registration to activate them.
 *
 * Must use `export {}` to be a module (not ambient) so declare module = augmentation, not override.
 */
export {};

// ── @fastify/cookie augmentation ────────────────────────────────────────────
declare module "fastify" {
  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
  }
  interface FastifyReply {
    setCookie(name: string, value: string, options?: Record<string, unknown>): this;
    clearCookie(name: string, options?: Record<string, unknown>): this;
  }
}

// ── @fastify/multipart augmentation ────────────────────────────────────────
interface MultipartFile {
  filename: string;
  mimetype: string;
  encoding: string;
  fieldname: string;
  toBuffer(): Promise<Buffer>;
  file: NodeJS.ReadableStream;
}

declare module "fastify" {
  interface FastifyRequest {
    file(): Promise<MultipartFile | undefined>;
    files(): AsyncIterableIterator<MultipartFile>;
  }
}
