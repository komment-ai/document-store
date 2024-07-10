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
 * @description Manages a collection of structured files (e.g., code chunks) and
 * provides methods for loading, storing, updating, and retrieving files. It maintains
 * metadata, lookup tables, and chunked storage to efficiently manage large collections
 * of files.
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
   * @description Initializes an instance with required namespace and getRemote method,
   * and optional additional meta data. It sets properties such as CHUNK_SIZE, namespace,
   * getRemote, meta, metaTemplate, lookup, chunks, content, and status.
   * 
   * @param {string*} namespace - Required, as indicated by the throw error if it is
   * not provided. It is used to set the namespace property of the object instance.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required to
   * be passed to the constructor.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to provide additional metadata.
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
   * @description Updates the `updated_at` property of the `meta` object within the
   * `DocumentStore` class, setting it to the provided `Date` value.
   * 
   * @param {Date*} updated_at - Assigned to the property `updated_at` of the object `this.meta`.
   * 
   * @returns {void} Equivalent to nothing or undefined.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads and updates the document store's metadata, lookup data, and
   * chunk information from a remote source or initializes with default values if no
   * data is available.
   * 
   * @returns {void} A special type that represents the absence of any object value.
   * It does not explicitly return a value but instead modifies some properties and
   * variables within its scope.
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
      // Updates meta object with values from template or summary if available.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Asynchronously loads summary and chunks for a document store. If no
   * summary exists, it first loads the summary. Then, it looks up chunk indices and
   * loads each chunk individually before setting the `chunks` status to true.
   * 
   * @returns {void} 0. It does not explicitly return a value.
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
   * @description Updates the metadata of an object by merging additional metadata with
   * the existing metadata. The new metadata replaces any duplicate keys, and the updated
   * metadata is stored in the `meta` property of the `DocumentStore` class.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to merge with existing metadata.
   * It is expected to be an object literal or a destructured object that contains
   * additional key-value pairs to be added or updated in the metadata.
   * 
   * @returns {void} Indicating that it does not return any value or data.
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
   * @description Asynchronously loads a chunk of structured data from a remote storage
   * and concatenates it with the existing content, updating the internal state of the
   * `DocumentStore` instance. If an error occurs during loading, it returns false;
   * otherwise, it returns true indicating successful loading.
   * 
   * @param {number*} chunkIndex - An index that identifies a specific chunk.
   * 
   * @returns {Promise<boolean>*} Resolved to a boolean indicating whether the chunk
   * was loaded successfully (true) or an error occurred (false).
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
   * @description Asynchronously retrieves a file from the DocumentStore based on its
   * path, ensuring that the required summary has been loaded and the corresponding
   * chunk is available. If not, it loads the chunk before retrieving the file.
   * 
   * @param {string*} path - The path to a file that needs to be retrieved from an
   * asynchronous operation, which returns a promise resolving with either a structured
   * file or null if the file could not be found.
   * 
   * @returns {Promise<StructuredFile | null>*} Either a `StructuredFile` object or
   * null, indicating whether the requested file exists in the data structure.
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
   * @description Adds a path to the end of the last lookup subtable in the `lookup`
   * array if it's not full, otherwise, creates a new subtable with the path. It ensures
   * that each subtable has a maximum size defined by the `CHUNK_SIZE` property.
   * 
   * @param {string*} path - Passed to the function when it is called, indicating a
   * path that needs to be added to the end of the lookup subtable.
   * 
   * @returns {void} 0 if the last lookup subtable is full and a new one is created or
   * null otherwise.
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
   * @description Adds a file to the end of an existing chunk or creates a new chunk
   * if the current one is full, based on a predefined CHUNK_SIZE.
   * 
   * @param {StructuredFile*} file - Expected to be passed when calling this function.
   * 
   * @returns {void} Equivalent to no return value. It does not explicitly return a value.
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
   * @description Adds a structured file to the document store, checking if the store
   * has been loaded and if the file exists before attempting to add it. If the file
   * already exists, it updates its content; otherwise, it appends the file to the end
   * of the lookup and chunks arrays.
   * 
   * @param {StructuredFile*} file - Required to be non-null and have a valid path
   * property. If either condition is not met, the function returns false without adding
   * the file.
   * 
   * @returns {boolean*} True if the file was successfully added and false otherwise.
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
   * @description Updates a file in the document store, handling cases where the file
   * does not exist and ensuring that required chunks are loaded before updating. It
   * returns a boolean indicating success or failure.
   * 
   * @param {StructuredFile*} file - Required for updating files. It represents a
   * structured file that needs to be added or updated in the storage system.
   * 
   * @returns {Promise<boolean>*} A promise that resolves to a boolean indicating whether
   * the file was successfully updated. If an error occurs during the update process,
   * the promise will resolve to false.
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
   * @description Generates a summary object containing two properties, `meta` and
   * `lookup`, which are references to corresponding properties within the `DocumentStore`
   * class. The summary provides an overview of the document store's metadata and lookup
   * data.
   * 
   * @returns {Summary*} An object containing two properties: meta and lookup.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Breaks down the content into smaller chunks based on a specified size,
   * generates unique keys for each chunk, and stores them in a Record object along
   * with their corresponding contents. The method then returns this Record object.
   * 
   * @returns {Record<string, any>*} A collection of key-value pairs where keys are
   * strings and values can be of any data type, representing chunks of the input content
   * with corresponding paths.
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
