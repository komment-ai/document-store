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

/**
 * @description Manages a structured file system for storing and retrieving code
 * documentation. It provides methods for adding, updating, and loading files, as
 * well as generating high-quality documentation outputs.
 * 
 * @implements {IDocumentStore}
 */
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
   * @description Sets up various instance variables such as `namespace`, `getRemote`,
   * `meta`, and `lookup`. It also initializes the `chunks` and `content` arrays, and
   * sets the `status` object to false for both `summary` and `chunks`.
   * 
   * @param {string} namespace - Used to set the namespace for the API calls.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Required for
   * initializing the instance of the class. It is used to fetch data from a remote
   * source, which will be stored in the `content` property of the class instance.
   * 
   * @param {Record<string, any>} additionalMeta - Used to store metadata that is not
   * part of the standard document store version, such as custom properties or values
   * that need to be associated with the chunk or the content.
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
   * @description Updates the `updated_at` metadata field of the object, which stores
   * information about when the document was last updated.
   * 
   * @param {Date} updated_at - Used to update the `updated_at` metadata field of the
   * entity.
   * 
   * @returns {Date} The updated `updated_at` field for the current object.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates summary information from the document store,
   * merging it with the local metadata template, and storing it back in the document
   * store.
   * 
   * @returns {Summary} An object containing meta data and two arrays: lookup and chunks.
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
      // Sets the value of `this.meta` object properties using the `summary.meta` property
      // as a fallback if it's undefined, or the original value if it's not defined in `summary.meta`.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asyncly loads chunks of data from the server based on their indices,
   * and sets the `chunks` property to `true` once loading is complete.
   * 
   * @returns {boolean} Whether the chunks have been loaded successfully or not.
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
   * @description Updates the metadata of a document by combining the existing metadata
   * with any additional metadata provided as an argument, creating a new metadata
   * object that includes all the updated values.
   * 
   * @param {Record<string, any>} additionalMeta - Used to provide additional metadata
   * to be merged with the existing metadata of the component.
   * 
   * @returns {Object} An updated version of the `meta` object by combining it with the
   * provided `additionalMeta` object.
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
   * @description Async loads a specific chunk from a remote source and adds it to the
   * document store's content and chunks array if successful.
   * 
   * @param {number} chunkIndex - Used to indicate which chunk to load from the server.
   * 
   * @returns {boolean} True if the chunk was successfully loaded and false otherwise.
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
   * @description Retrieves a file from a summary file and loads it into memory if
   * necessary. It calculates the chunk and file index within that chunk, and checks
   * if the file is already loaded in the correct chunk before returning it.
   * 
   * @param {string} path - Used to specify the file path being looked up.
   * 
   * @returns {StructuredFile|null} A file object or null if it's not found.
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
   * @description Adds a new document to the end of the lookup table if it is full or
   * appends it to the last existing entry in the table otherwise.
   * 
   * @param {string} path - Passed to the function as an argument. Its purpose is to
   * represent the path or location where the new element should be added to the lookup
   * subtable.
   * 
   * @returns {string[]} An array of strings.
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
   * @description Adds files to the end of chunks if the last subtable is full or if
   * the current chunk is at its maximum size.
   * 
   * @param {StructuredFile} file - Used to add a file to the end of an array of chunks.
   * 
   * @returns {number[]} The updated length of the chunks array after adding a new file
   * to the end of it.
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
   * @description Adds a file to the document store if certain conditions are met,
   * including that the `status.chunks` property is set and the provided file path
   * exists. It updates the file in the store if it already exists, or adds it to the
   * end of the lookup and chunks arrays if it does not exist.
   * 
   * @param {StructuredFile} file - Used to represent a file to be added to the content
   * library.
   * 
   * @returns {boolean} True when the file is successfully added to the content, and
   * false otherwise.
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
   * @description Updates a file in the store by checking its existence, loading it if
   * necessary, and storing it in the appropriate chunk and index position.
   * 
   * @param {StructuredFile} file - Used to represent a file to be updated or added to
   * the cache. Its purpose is to provide the file information for updating or adding
   * it to the cache.
   * 
   * @returns {boolean} Whether the file was updated successfully or not.
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
   * @description Generates an object summarizing the meta and lookup data of the
   * document store.
   * 
   * @returns {Summary} A combination of two properties: `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Generates and returns a Record object containing chunks of the document,
   * where each chunk is represented by a key-value pair consisting of the chunk path
   * and the chunk content.
   * 
   * @returns {Record<string,any>} A collection of key-value pairs where each key is a
   * unique chunk identifier and each value is the contents of that chunk.
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
