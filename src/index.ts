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
 * @description Organizes and stores code documentation for efficient retrieval
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
   * @description Establishes instance variables for `namespace`, `getRemote`, `CHUNK_SIZE`,
   * and other metadata, and initializes various internal arrays and objects.
   * 
   * @param {string} namespace - Required for creating a new chunking client. It
   * represents the root namespace of the document store where the chunks will be stored.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>} getRemote - Required to be
   * a function that retrieves data from a remote source.
   * 
   * @param {Record<string, any>} additionalMeta - An optional field to store additional
   * metadata about the document.
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
   * @description Updates the `updated_at` metadata field of the `DocumentStore` instance
   * by passing the provided `Date` object as an argument.
   * 
   * @param {Date} updated_at - Assigned to the `meta.updated_at` property of the current
   * instance.
   * 
   * @returns {void} The result of updating the `meta` object's `updated_at` property
   * with the provided `Date`.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Retrieves and updates the summary of documents stored in the Document
   * Store, including meta information and chunk-level data.
   * 
   * @returns {Summary} An object containing various metadata and chunk information.
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
      // Updates an object `this.meta` by key-value pairing,
      // using a callback function to determine the value for each key.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Of the `DocumentStore` class asynchronously loads chunks of data from
   * a summary and updates the `status` property with the loaded chunks.
   * 
   * @returns {void} Indicative of the function finishing its task without any return
   * value.
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
   * @description Of the `DocumentStore` class updates the metadata of an object by
   * merging the original metadata with additional metadata provided as an argument.
   * 
   * @param {Record<string, any>} additionalMeta - Used to add or update additional
   * metadata for the current instance of the class.
   * 
   * @returns {Recordstring} An augmented metadata object combining the existing metadata
   * and additional metadata provided as argument.
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
   * @description Of the `DocumentStore` class asyncously loads a chunk of data from a
   * remote source and concatenaates it with the rest of the content, storing it in the
   * `chunks` property. If the chunk is already loaded, the method returns `true`.
   * 
   * @param {number} chunkIndex - Representing an index of a chunk to be loaded from
   * the remote source.
   * 
   * @returns {Promiseboolean} True if the chunk was successfully loaded and false otherwise.
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
   * @description Of the `DocumentStore` class retrieves a file from a chunk based on
   * its path. It first checks if the summary has been loaded, then calculates the chunk
   * and file indices, and finally returns the file data if found, otherwise returns null.
   * 
   * @param {string} path - Passed as input to the function. It represents the path of
   * the file being searched for.
   * 
   * @returns {StructuredFile} Either a loaded file or null if the file is not found
   * or has not been loaded yet.
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
   * @description Updates the `lookup` subtable of a `DocumentStore` instance based on
   * the provided path, inserting new elements or expanding an existing one if necessary.
   * 
   * @param {string} path - Used to add new entries to the lookup subtable.
   * 
   * @returns {string} A new subtable added to the existing lookup table or the path
   * if no new subtable is created.
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
   * @description In the `DocumentStore` class appends files to an array of chunks based
   * on the file's size and the current length of the chunks array.
   * 
   * @param {StructuredFile} file - Passed as an argument to the function.
   * 
   * @returns {StructuredFile} A new chunk containing the given file if the last subtable
   * is full, or the existing chunk with the added file otherwise.
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
   * @description Of the `DocumentStore` class allows adding a file to the document
   * store if certain conditions are met, including that the file exists and has not
   * been loaded before. If successful, the method updates the file's metadata and adds
   * it to the end of the lookup and chunks lists.
   * 
   * @param {StructuredFile} file - Passed as an object containing file path, and other
   * related information.
   * 
   * @returns {boolean} `true` if the file was successfully added to the lookups and
   * chunks, otherwise it returns `false`.
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
   * @description Of the `DocumentStore` class updates a file in the store by checking
   * if it exists, loading the chunk if necessary, and adding or updating the file in
   * the chunk.
   * 
   * @param {StructuredFile} file - Passed as an argument to the function.
   * 
   * @returns {Promiseboolean} Whether the file was successfully updated or not.
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
   * @description Returns an object containing the `meta` and `lookup` properties of
   * the `DocumentStore` instance.
   * 
   * @returns {Summary} An object containing two properties: `meta` and `lookup`.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Of the `DocumentStore` class takes the contents of a document and
   * splits them into chunks, storing each chunk in a specific path within a record.
   * 
   * @returns {Recordstring} An object containing key-value pairs where each key
   * corresponds to a chunk path and each value corresponds to a chunk of text.
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
