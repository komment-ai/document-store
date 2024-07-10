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
 * @description Manages structured files, allowing for efficient storage and retrieval
 * of file metadata and contents. It enables chunk-based loading, lookup, and updating
 * of files, facilitating large-scale data processing and querying.
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
   * @description Initializes an instance with required parameters: namespace and
   * getRemote method. It sets properties, such as CHUNK_SIZE, namespace, getRemote,
   * meta, metaTemplate, lookup, chunks, content, and status. It validates the input
   * and throws errors if namespace or getRemote is missing.
   * 
   * @param {string*} namespace - Required to be specified when constructing an instance
   * of this class. It represents a unique identifier for the namespace of the document
   * store.
   * 
   * @param {(...args: any[]) => Promise<Record<any, any>>*} getRemote - Required. It
   * returns a promise that resolves to an object with property values of type any.
   * 
   * @param {Record<string, any>*} additionalMeta - Used to add extra metadata properties.
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
   * @description Updates the `updated_at` property of the `meta` object with the
   * provided `updated_at` date. This method appears to be part of the `DocumentStore`
   * class, responsible for managing document metadata.
   * 
   * @param {Date*} updated_at - Passed to set the value of `this.meta.updated_at`.
   * 
   * @returns {undefined} A property of an object.
   */
  setUpdatedAt = (updated_at: Date) => {
    this.meta.updated_at = updated_at;
  };

  /**
   * @description Loads and updates the document store's metadata, lookup data, and
   * chunks from a remote source or initializes them with default values if no data is
   * available.
   * 
   * @returns {async} A promise that resolves to an object of type Summary with properties
   * meta, lookup, and chunks.
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
      // Assigns meta values to object properties.

      this.meta[key] = summary?.meta?.[key] ?? value;
    });
    this.lookup = summary.lookup || [];
    this.status.summary = true;
  };

  /**
   * @description Loads chunks and summary of data for a document, checking if the
   * summary has been loaded first. If not, it calls the `loadSummary` method. Then,
   * it iterates over chunk indices and loads corresponding chunks using the `loadChunk`
   * method. Finally, it sets the `chunks` property to `true`.
   * 
   * @returns {undefined} A promise that resolves to nothing.
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
   * @description Updates the metadata object of a `DocumentStore` class by merging it
   * with additional metadata provided as an argument. The resulting metadata is stored
   * in the `meta` property of the class. This allows dynamic modification of the metadata.
   * 
   * @param {Record<string, any>*} additionalMeta - Expected to be an object with string
   * keys and values of any type. This object contains additional metadata that needs
   * to be updated in the current metadata.
   * 
   * @returns {unction} An updated meta object that combines the original meta object
   * with the additional metadata.
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
   * @description Asynchronously loads a chunk of data from a remote location, concatenates
   * it to the existing content, and stores it in an array of chunks. If loading fails,
   * it returns false; otherwise, it returns true indicating successful loading.
   * 
   * @param {number*} chunkIndex - Required when calling this asynchronous function.
   * It represents the index of the chunk to be loaded.
   * 
   * @returns {Promise<boolean>*} Resolved to either `true` (if the chunk load is
   * successful) or `false` (if an error occurs during loading).
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
   * @description Asynchronously retrieves a file from a collection of structured files,
   * given its path. It checks if the summary has been loaded and ensures that the
   * corresponding chunk is loaded or loaded if necessary. The file index within the
   * chunk is also verified before returning the requested file.
   * 
   * @param {string*} path - Required for the function to operate correctly, representing
   * the path of the file for which structured data is requested.
   * 
   * @returns {Promise<StructuredFile | null>*} Either a StructuredFile object or null.
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
   * @description Adds a given path to the end of the lookup table. If the current
   * subtable is full, it creates a new one. Otherwise, it appends the path to the
   * existing subtable. This approach allows efficient storage and retrieval of paths
   * in the DocumentStore class.
   * 
   * @param {string*} path - Required for execution.
   * 
   * @returns {unction} Undefined since it doesn't explicitly define a return statement.
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
   * @description Adds a file to the end of the existing chunk or creates a new one if
   * the current chunk is full, ensuring that each chunk does not exceed a specific
   * size (`CHUNK_SIZE`).
   * 
   * @param {StructuredFile*} file - An input variable that represents a file with
   * structured data. It is used to determine whether it should be added to the existing
   * chunk or create a new one.
   * 
   * @returns {unction} Called as a higher-order function. It does not explicitly return
   * any value, but it updates the state of an object by pushing a new file into either
   * a newly created chunk or the last existing one.
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
   * @description Adds a file to the `DocumentStore`. If the store has no chunks, it
   * throws an error. If the file exists, it updates the existing file; otherwise, it
   * adds the new file to the end of the lookup and chunk lists and pushes it to the
   * content array.
   * 
   * @param {StructuredFile*} file - Required to be present and have a valid path.
   * 
   * @returns {boolean*} `true` if the file is successfully added, and `false` otherwise,
   * indicating whether the operation was successful or not.
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
   * @description Asynchronously updates a file's metadata in the document store. It
   * checks if the file exists, adds it to the chunk if necessary, loads the corresponding
   * chunk if needed, and updates the file's index in the chunk and content arrays.
   * 
   * @param {StructuredFile*} file - Required to be present for the function to continue
   * processing.
   * 
   * @returns {Promise<boolean>*} A promise that resolves to either true or false.
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
   * @description Returns an object containing two properties, `meta` and `lookup`,
   * which are obtained from the current instance's `this.meta` and `this.lookup`
   * attributes, respectively. The returned object represents a summary of the document
   * store.
   * 
   * @returns {Summary*} An object containing two properties: meta and lookup, both
   * having values inherited from this reference.
   */
  outputSummary(): Summary {
    return {
      meta: this.meta,
      lookup: this.lookup,
    };
  }
  /**
   * @description Splits the `content` property into chunks based on the `CHUNK_SIZE`,
   * generates chunk keys, and stores each chunk in a `Record` object. The method returns
   * this `Record` containing chunked content.
   * 
   * @returns {Record<string, any>*} An object where keys are strings and values can
   * be any data type.
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
