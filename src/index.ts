/**
 * DocumentStore
 *
 * Manage adding, retrieving and updating docs in the .{namespace} folder
 *
 * Usage:
 * const getRemote = () => {} // method to fetch from remote store
 * const docStore = new DocumentStore(getRemote);
 * await docStore.loadSummary();
 * const structureFileContent = await docStore.getFile('path/to/file.js')
 *
 * await docStore.addFile(structuredFileContent);
 */

import { IDocumentStore } from "../types/IDocumentStore";
import { StructuredFile } from "../types/StructuredFile";
import { Summary } from "../types/Summary";

const CHUNK_SIZE = 40;
const DOCUMENT_STORE_VERSION = "1";

class DocumentStore implements IDocumentStore {
  CHUNK_SIZE: number;
  namespace: string;
  getRemote: (...args: any[]) => Promise<Record<any, any>>;
  meta: {
    version: string;
    created_at: Date;
    updated_at: Date;
    [key: string]: any;
  };
  metaTemplate: Record<string, any>;
  lookup: string[][];
  chunks: StructuredFile[][];
  content: StructuredFile[];
  status: {
    summary: boolean;
    chunks: boolean;
  };

  /**
   * @description Sets up the necessary objects and properties for the DocuStore class,
   * including the namespace, getRemote method, and metadata.
   * 
   * @param {string} namespace - namespace for which the code generator is creating
   * documentation, and it is required to be provided.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - method that
   * returns a Promise of a Record containing the document's data.
   * 
   * @param {Record<string, any>} additionalMeta - metadata that can be added to the
   * document store, such as version number, created and updated at timestamps, and
   * other custom data, which can be used to modify or extend the default behavior of
   * the function.
   */
  constructor(
    namespace: string,
    getRemote: (...args: any[]) => Promise<Record<any, any>>,
    additionalMeta: Record<string, any> = {},
  ) {
    if (!namespace) throw new Error("namespace is required");
    if (!getRemote) throw new Error("getRemote method is required");

    this.CHUNK_SIZE = CHUNK_SIZE;
    this.namespace = namespace;
    this.getRemote = getRemote;
    this.meta = {
      version: DOCUMENT_STORE_VERSION,
      updated_at: new Date(),
      created_at: new Date(),
      ...additionalMeta,
    };
    this.metaTemplate = additionalMeta;
    this.lookup = [];
    this.chunks = [];
    this.content = [];
    this.status = {
      summary: false,
      chunks: false,
    };
  }

  /**
   * @description Sets the `updated_at` metadata for an instance, updating its value
   * to the given `updated_at` date.
   * 
   * @param {Date} updated_at - timestamp when the record was last updated, and it is
   * assigned to the `meta.updated_at` property within the function to maintain an
   * updated version of the record's metadata.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves remote documentation data and updates local metadata, chunk
   * information, and lookup table.
   */
  loadSummary = async () => {
    let summary: Summary = {
      meta: {
        version: DOCUMENT_STORE_VERSION,
        created_at: new Date(),
        updated_at: new Date(),
        ...this.metaTemplate,
      },
      lookup: [],
      chunks: [],
    };
    try {
      const remoteSummary = (await this.getRemote(
        this.getChunkSummaryPath(),
      )) as Summary;

      if (Object.keys(remoteSummary).length) {
        summary = remoteSummary;
      }
    } catch (error) {
      console.info("No docs stored yet");
    }

    this.meta.version = summary?.meta?.version || DOCUMENT_STORE_VERSION;
    this.meta.created_at = summary?.meta?.created_at || new Date();
    this.meta.updated_at = summary?.meta?.updated_at || new Date();
    Object.entries(this.metaTemplate).forEach(([key, value]) => {
      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Loads chunks of data from a database based on their indices, marking
   * them as loaded in the status object.
   */
  load = async () => {
    if (!this.status.summary) {
      await this.loadSummary();
    }
    const chunkIndices = this.lookup.map((_keys: string[], i: number) => i);

    for (const chunkIndex of chunkIndices) {
      await this.loadChunk(chunkIndex);
    }

    this.status.chunks = true;
  };

  chunkIndexToChunkKey = (k: number): string => `${k}`.padStart(5, "0");

  chunkKeyToChunkPath = (k: string): string => `.${this.namespace}/${k}.json`;

  getChunkSummaryPath = (): string =>
    `.${this.namespace}/${this.namespace}.json`;

  /**
   * @description Updates the `meta` property of an object by combining it with the
   * provided `additionalMeta` property.
   * 
   * @param {Record<string, any>} additionalMeta - metadata to be added to the current
   * instance of `Record`.
   */
  updateMetadata = (additionalMeta: Record<string, any>) => {
    this.meta = {
      ...this.meta,
      ...additionalMeta,
    };
  };

  fileIndexToChunkId = (fileIndex: number) =>
    Math.floor(fileIndex / CHUNK_SIZE);

  isChunkLoaded = (chunkIndex: number): boolean =>
    this.chunks[chunkIndex]?.length > 0;

  /**
   * @description Retrieves a specific chunk from a remote source and adds it to the
   * current content array if not already loaded, returning a boolean indicating
   * successful loading.
   * 
   * @param {number} chunkIndex - 0-based index of a chunk within the total number of
   * chunks in the StructuredFile collection, and is used to determine whether the chunk
   * has already been loaded or not.
   * 
   * @returns {Promise<boolean>} a `Promise` that resolves to `true` if the chunk was
   * successfully loaded, or `false` otherwise.
   */
  loadChunk = async (chunkIndex: number): Promise<boolean> => {
    if (!this.isChunkLoaded(chunkIndex)) {
      try {
        const chunk: StructuredFile[] = (await this.getRemote(
          this.chunkKeyToChunkPath(this.chunkIndexToChunkKey(chunkIndex)),
        )) as StructuredFile[];

        this.content = this.content.concat(chunk);

        this.chunks[chunkIndex] = chunk;
      } catch (error) {
        return false;
      }
    }
    return true;
  };
  /**
   * @description Retrieves a file from a summary, checks if it is in the correct chunk,
   * and returns the file data if found, otherwise returns null.
   * 
   * @param {string} path - file path that is being searched for within the current
   * chunk, and it is used to calculate the file's index within the chunk and return
   * the corresponding file data.
   * 
   * @returns {Promise<StructuredFile | null>} a `StructuredFile` object representing
   * the file or null if it's not found.
   */
  getFile = async (path: string): Promise<StructuredFile | null> => {
    if (!this.status.summary)
      throw Error("Must call .loadSummary before accessing files");

    // calculate the chunk it is in
    const chunkIndex = this.getChunkFileIsIn(path);
    if (chunkIndex === -1) {
      return null;
    }
    if (!this.isChunkLoaded(chunkIndex)) {
      await this.loadChunk(chunkIndex);
    }
    const fileIndexInChunk = this.getFileIndexInChunk(chunkIndex, path);
    // console.debug(
    //   `File is in Chunk #${chunkIndex} at index #${fileIndexInChunk}`,
    // );

    if (this.chunks[chunkIndex][fileIndexInChunk].path !== path) {
      console.error("Incorrect chunk/lookup. Rebuild?");
    }

    return this.chunks[chunkIndex][fileIndexInChunk];
  };

  // Use this if obfuscating:
  // return btoa(path);
  getFileHash = (path: string): string => path;

  getChunkFileIsIn = (path: string): number =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path)));

  getFileIndexInChunk = (chunk: number, path: string): number =>
    this.lookup[chunk].indexOf(this.getFileHash(path));

  getFileIndex = (path: string): number =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path)));

  fileExists = (path: string): boolean =>
    this.lookup.findIndex((sub) => sub.includes(this.getFileHash(path))) > -1;

  /**
   * @description Updates the `lookup` subtable, adding a new entry to the last position
   * if the last entry is full or reaching the maximum size, or adding a new entry to
   * the last position of the previous entry otherwise.
   * 
   * @param {string} path - path to be looked up in the subtable, and determines whether
   * a new subtable needs to be created or an existing one expanded.
   */
  addToEndOfLookup = (path: string) => {
    // If the last lookup subtable is full, create a new one
    if (
      this.lookup.length === 0 ||
      this.lookup[this.lookup.length - 1].length === this.CHUNK_SIZE
    ) {
      this.lookup.push([path]);
    } else {
      this.lookup[this.lookup.length - 1].push(path);
    }
  };
  /**
   * @description Updates a structured file's chunks based on its size, either adding
   * a new chunk if the last one is empty or appending to it if not.
   * 
   * @param {StructuredFile} file - file that is being processed and added to the
   * `chunks` array in the structured file system.
   */
  addToEndOfChunks = (file: StructuredFile) => {
    // If the last lookup subtable is full, create a new one
    if (
      this.chunks.length === 0 ||
      this.chunks[this.chunks.length - 1].length === this.CHUNK_SIZE
    ) {
      this.chunks.push([file]);
    } else {
      this.chunks[this.chunks.length - 1].push(file);
    }
  };
  /**
   * @description Adds a file to a Structured File instance's content and chunks,
   * verifying that the file exists and that it has not been added previously.
   * 
   * @param {StructuredFile} file - file to be added to the StructuredFile object's
   * content, and it is used to check if the file exists and to update its metadata in
   * the object.
   * 
   * @returns {boolean} a boolean value indicating whether the file was successfully
   * added to the list of files.
   */
  addFile = (file: StructuredFile): boolean => {
    if (!this.status.chunks) throw Error("Must call .load before adding files");
    if (!file || !file.path) return false;

    if (this.fileExists(file.path)) {
      try {
        this.updateFile(file);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }

    this.addToEndOfLookup(file.path);
    this.addToEndOfChunks(file);

    this.content.push(file);
    return true;
  };
  /**
   * @description Updates a file in a structured file, checking if it already exists,
   * loading it if necessary, and storing it in the appropriate chunk and file index positions.
   * 
   * @param {StructuredFile} file - file to be added, updated or retrieved, and it is
   * used to verify its existence and
   * check if it has already been loaded before updating the structured file's content.
   * 
   * @returns {Promise<boolean>} a boolean value indicating whether the specified file
   * was successfully added to the structured file.
   */
  updateFile = async (file: StructuredFile): Promise<boolean> => {
    if (!this.status.chunks)
      throw Error("Must call .load before updating files");

    if (!file) return false;

    if (!this.fileExists(file.path)) {
      try {
        this.addFile(file);
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }
    const chunkIndex = this.getChunkFileIsIn(file.path);
    if (chunkIndex === -1) {
      return false;
    }
    if (!this.isChunkLoaded(chunkIndex)) {
      await this.loadChunk(chunkIndex);
    }
    const fileIndexInChunk = this.getFileIndexInChunk(chunkIndex, file.path);
    this.chunks[chunkIndex][fileIndexInChunk] = file;
    this.content[chunkIndex * this.CHUNK_SIZE + fileIndexInChunk] = file;
    return true;
  };
  /**
   * @description Generates a summary object containing the `meta` and `lookup` properties
   * based on the internal state of the calling instance.
   * 
   * @returns {Summary} an object containing `meta` and `lookup` properties.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Takes a `content` array and returns an object with keys that correspond
   * to file paths for chunks of the content, each chunk being a slice of the original
   * array.
   * 
   * @returns {Record<string, any>} a Record<string, any> containing Key-Value pairs
   * of chunks from the given content.
   */
  outputChunks(): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (let i = 0, j = 0; i < this.content.length; i += this.CHUNK_SIZE, j++) {
      const chunk = this.content.slice(i, i + this.CHUNK_SIZE);
      outputs[this.chunkKeyToChunkPath(this.chunkIndexToChunkKey(j))] = chunk;
    }

    return outputs;
  }
}

export default DocumentStore;
